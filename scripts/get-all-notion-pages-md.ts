import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';

interface Page {
  id: string;
  contents: string;
}

export async function getAllNotionPagesMarkdown(): Promise<Page[]> {
  const notion = new Client({
    auth: process.env.NOTION_TOKEN,
  });

  const n2m = new NotionToMarkdown({ notionClient: notion });

  // get all pages
  const response = await notion.search({
    filter: {
      property: 'object',
      value: 'page',
    },
  });

  // transform all markdowns to string
  const pages = (
    await Promise.all(
      response.results
        .map(async ({ id }) => {
          const mdBlocks = await n2m.pageToMarkdown(id);
          const mdString = n2m.toMarkdownString(mdBlocks);
          if (!mdString.parent) return null;
          return { id, contents: mdString.parent };
        })
        .filter(Boolean),
    )
  ).filter(Boolean);

  return pages as Page[];
}
