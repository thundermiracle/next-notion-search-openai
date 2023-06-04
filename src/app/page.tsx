/* eslint-disable react/no-children-prop */
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import LoadingDots from '../components/LoadingDots';

const Home = () => {
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');

  const generateAnswer = async (event: any) => {
    event.preventDefault();
    setGeneratedAnswer('');
    setLoading(true);

    const response = await fetch('/api/vector-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
      }),
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const stream = response.body;
    if (!stream) {
      setLoading(false);
      return;
    }
    const reader = stream.getReader();

    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: _done } = await reader.read();
      done = _done;
      if (value) {
        const text = decoder.decode(value);
        setGeneratedAnswer((prev) => prev + text);
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex max-w-5xl mx-auto flex-col items-center justify-center py-2 min-h-screen">
      <main className="flex flex-1 w-full flex-col items-center text-center px-4 mt-12 sm:mt-20">
        <h2
          id="question"
          className="sm:text-5xl text-3xl font-bold text-slate-900"
        >
          Answer your question base on the notion pages
        </h2>
        <div className="max-w-2xl">
          <textarea
            aria-labelledby="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black my-5 p-4"
          />
          <button
            type="button"
            className="bg-black rounded-xl text-white font-medium px-4 py-2 hover:bg-black/80 w-full"
            disabled={loading}
            onClick={loading ? undefined : generateAnswer}
          >
            {loading ? <LoadingDots color="white" variant="large" /> : 'Ask'}
          </button>
        </div>
        <hr className="h-px bg-gray-700 border-1 dark:bg-gray-700" />
        <div className="space-y-10 my-10">
          {generatedAnswer && (
            <div className="space-y-8 max-w-xl mx-auto">
              <div className="bg-white rounded-xl shadow-md p-4 transition border text-left">
                <ReactMarkdown
                  children={generatedAnswer}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter
                          {...props}
                          children={String(children).replace(/\n$/, '')}
                          style={atomDark}
                          language={match[1]}
                          PreTag="div"
                        />
                      ) : (
                        <code {...props} className={className}>
                          {children}
                        </code>
                      );
                    },
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
