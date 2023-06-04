/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js';
import { codeBlock, oneLine } from 'common-tags';
import GPT3Tokenizer from 'gpt3-tokenizer';

import { ApplicationError, UserError } from '@/utils/errors';
import { edgeStreamer } from '@/utils/EdgeStreamHelper';

import type { CreateCompletionRequest } from 'openai';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const openAiKey = process.env.OPENAI_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!openAiKey) {
      throw new ApplicationError('Missing environment variable OPENAI_KEY');
    }

    if (!supabaseUrl) {
      throw new ApplicationError('Missing environment variable SUPABASE_URL');
    }

    if (!supabaseServiceKey) {
      throw new ApplicationError(
        'Missing environment variable SUPABASE_SERVICE_ROLE_KEY',
      );
    }

    const requestData = await req.json();

    if (!requestData) {
      throw new UserError('Missing request data');
    }

    const { question } = requestData;

    if (!question) {
      throw new UserError('Missing query in request data');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Moderate the content to comply with OpenAI T&C
    const sanitizedQuery = question.trim();
    const moderationResponse = await fetch(
      'https://api.openai.com/v1/moderations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: sanitizedQuery,
        }),
      },
    ).then((res) => res.json());

    const [results] = moderationResponse.results;

    if (results.flagged) {
      throw new UserError('Flagged content', {
        flagged: true,
        categories: results.categories,
      });
    }

    const embeddingResponse = await fetch(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: sanitizedQuery.replaceAll('\n', ' '),
        }),
      },
    );

    if (embeddingResponse.status !== 200) {
      throw new ApplicationError(
        'Failed to create embedding for question',
        embeddingResponse,
      );
    }

    const {
      data: [{ embedding }],
    } = await embeddingResponse.json();

    const { error: matchError, data: pageSections } = await supabaseClient.rpc(
      'match_page_sections',
      {
        embedding,
        match_threshold: 0.78,
        match_count: 10,
        min_content_length: 50,
      },
    );

    if (matchError) {
      throw new ApplicationError('Failed to match page sections', matchError);
    }

    const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });
    let tokenCount = 0;
    let contextText = '';

    for (let i = 0; i < pageSections.length; i++) {
      const pageSection = pageSections[i];
      const content = pageSection.content;
      const encoded = tokenizer.encode(content);
      tokenCount += encoded.text.length;

      if (tokenCount >= 1500) {
        break;
      }

      contextText += `${content.trim()}\n---\n`;
    }

    const prompt = codeBlock`
      ${oneLine`
        You love helping people!
        Using the following Context Section from the provided document, answer the questions and output it in markdown format.
        If you're unsure or the document doesn't explicitly provide an answer to the question, respond with "I'm sorry, but I cannot answer that question."
      `}

      Context Section:
      ${contextText}

      Question: """
      ${sanitizedQuery}
      """
      
      Do not forget to answer the question in markdown format. Wrap command or code snippets in code blocks.
    `;

    const completionOptions: CreateCompletionRequest = {
      model: 'text-davinci-003',
      prompt,
      max_tokens: 512,
      temperature: 0,
      stream: true,
    };

    const response = await fetch('https://api.openai.com/v1/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completionOptions),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ApplicationError('Failed to generate completion', error);
    }

    // Proxy the streamed SSE response from OpenAI
    const stream = await edgeStreamer(response);

    return new Response(stream);
  } catch (err: unknown) {
    if (err instanceof UserError) {
      return new Response(
        JSON.stringify({
          error: err.message,
          data: err.data,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } else if (err instanceof ApplicationError) {
      // Print out application errors with their additional data
      console.error(`${err.message}: ${JSON.stringify(err.data)}`);
    } else {
      // Print out unexpected errors as is to help with debugging
      console.error(err);
    }

    return new Response(
      JSON.stringify({
        error: 'There was an error processing your request',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
