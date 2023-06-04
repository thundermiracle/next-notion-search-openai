import { createParser } from 'eventsource-parser';

import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser';

export async function edgeStreamer(res: Response) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      function onParse(event: ParsedEvent | ReconnectInterval) {
        if (event.type === 'event') {
          const data = event.data;
          if (data === '[DONE]') {
            // Signal the end of the stream
            controller.close();
          }
          // feed the data to the TransformStream for further processing
          try {
            const json = JSON.parse(data);
            const text = json.choices[0].text;
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (err) {
            controller.error(err);
          }
        }
      }

      const parser = createParser(onParse);
      // https://web.dev/streams/#asynchronous-iteration
      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return readableStream;
}
