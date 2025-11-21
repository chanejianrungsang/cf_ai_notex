/**
 * Summary Generation Workflow
 * Multi-step AI workflow to generate concise note summaries
 */

interface SummaryWorkflowParams {
  noteId: string;
  noteContent: string;
  noteTitle: string;
}

interface SummaryResult {
  summary: string;
  keyPoints: string[];
  topics: string[];
}

export class SummaryWorkflow {
  async run(env: any, params: SummaryWorkflowParams): Promise<SummaryResult> {
    const { noteContent, noteTitle } = params;

    // Step 1: Analyze content and extract main topics
    const topics = await this.extractTopics(env, noteContent, noteTitle);

    // Step 2: Generate concise summary
    const summary = await this.generateSummary(env, noteContent, noteTitle, topics);

    // Step 3: Extract key points
    const keyPoints = await this.extractKeyPoints(env, noteContent, summary);

    return {
      summary,
      keyPoints,
      topics,
    };
  }

  private async extractTopics(env: any, content: string, title: string): Promise<string[]> {
    const prompt = `Analyze this note and identify 3-5 main topics or concepts:

Title: ${title}
Content:
${content.slice(0, 3000)}

Return ONLY a JSON array of topic strings, e.g., ["topic1", "topic2", "topic3"]`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'You are a study assistant that identifies key topics in educational notes. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const topicsText = response.response || '[]';
      // Try to extract JSON array from response
      const match = topicsText.match(/\[.*\]/s);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [];
    } catch (error) {
      console.error('Error extracting topics:', error);
      return ['General'];
    }
  }

  private async generateSummary(env: any, content: string, title: string, topics: string[]): Promise<string> {
    const prompt = `Generate a concise 2-3 paragraph summary of this note:

Title: ${title}
Main Topics: ${topics.join(', ')}
Content:
${content.slice(0, 4000)}

Write a clear, concise summary that captures the essential information. Use proper formatting with markdown.`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'You are a study assistant that creates clear, concise summaries of educational notes.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.5,
      });

      return response.response || 'Unable to generate summary.';
    } catch (error) {
      console.error('Error generating summary:', error);
      return 'Error generating summary.';
    }
  }

  private async extractKeyPoints(env: any, content: string, summary: string): Promise<string[]> {
    const prompt = `Based on this note summary, extract 5-7 key points or takeaways:

Summary:
${summary}

Original Content (for context):
${content.slice(0, 2000)}

Return ONLY a JSON array of key point strings, e.g., ["point1", "point2", "point3"]`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'You are a study assistant that identifies key takeaways. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.3,
      });

      const pointsText = response.response || '[]';
      // Try to extract JSON array from response
      const match = pointsText.match(/\[.*\]/s);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [];
    } catch (error) {
      console.error('Error extracting key points:', error);
      return [];
    }
  }
}
