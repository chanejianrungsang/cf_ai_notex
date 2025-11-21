/**
 * Study Questions Workflow
 * Multi-step AI workflow to generate study questions from notes
 */

interface QuestionsWorkflowParams {
  noteId: string;
  noteContent: string;
  noteTitle: string;
}

interface StudyQuestion {
  question: string;
  type: 'recall' | 'comprehension' | 'application';
  difficulty: 'easy' | 'medium' | 'hard';
}

interface QuestionsResult {
  questions: StudyQuestion[];
  totalCount: number;
}

export class QuestionsWorkflow {
  async run(env: any, params: QuestionsWorkflowParams): Promise<QuestionsResult> {
    const { noteContent, noteTitle } = params;

    // Step 1: Analyze content difficulty
    const difficulty = await this.analyzeContentDifficulty(env, noteContent);

    // Step 2: Generate questions
    const questions = await this.generateQuestions(env, noteContent, noteTitle, difficulty);

    // Step 3: Categorize questions
    const categorizedQuestions = await this.categorizeQuestions(env, questions);

    return {
      questions: categorizedQuestions,
      totalCount: categorizedQuestions.length,
    };
  }

  private async analyzeContentDifficulty(env: any, content: string): Promise<string> {
    const prompt = `Analyze the difficulty level of this educational content. 
Consider: technical terminology, concept complexity, prerequisites needed.

Content:
${content.slice(0, 2000)}

Return ONLY one word: "beginner", "intermediate", or "advanced"`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'You analyze educational content difficulty. Return only one word.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 10,
        temperature: 0.3,
      });

      const level = (response.response || 'intermediate').toLowerCase().trim();
      if (['beginner', 'intermediate', 'advanced'].includes(level)) {
        return level;
      }
      return 'intermediate';
    } catch (error) {
      console.error('Error analyzing difficulty:', error);
      return 'intermediate';
    }
  }

  private async generateQuestions(
    env: any,
    content: string,
    title: string,
    difficulty: string
  ): Promise<string[]> {
    const prompt = `Generate 7-10 study questions for this note. Include a mix of:
- Recall questions (testing memory)
- Comprehension questions (testing understanding)
- Application questions (testing ability to use concepts)

Title: ${title}
Difficulty Level: ${difficulty}
Content:
${content.slice(0, 4000)}

Return ONLY a JSON array of question strings, e.g., ["Question 1?", "Question 2?", "Question 3?"]`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'You generate study questions for educational content. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.6,
      });

      const questionsText = response.response || '[]';
      // Try to extract JSON array from response
      const match = questionsText.match(/\[.*\]/s);
      if (match) {
        const questions = JSON.parse(match[0]);
        return questions.filter((q: any) => typeof q === 'string' && q.length > 0);
      }
      return [];
    } catch (error) {
      console.error('Error generating questions:', error);
      return [];
    }
  }

  private async categorizeQuestions(env: any, questions: string[]): Promise<StudyQuestion[]> {
    if (questions.length === 0) {
      return [];
    }

    const prompt = `Categorize each study question by TYPE and DIFFICULTY.

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

For each question, determine:
TYPE: "recall" (memory/facts), "comprehension" (understanding), or "application" (using concepts)
DIFFICULTY: "easy", "medium", or "hard"

Return ONLY a JSON array of objects like:
[
  {"index": 0, "type": "recall", "difficulty": "easy"},
  {"index": 1, "type": "comprehension", "difficulty": "medium"}
]`;

    try {
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'You categorize study questions. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.2,
      });

      const categoriesText = response.response || '[]';
      // Try to extract JSON array from response
      const match = categoriesText.match(/\[.*\]/s);
      if (match) {
        const categories = JSON.parse(match[0]) as Array<{
          index: number;
          type: string;
          difficulty: string;
        }>;

        return questions.map((question, idx) => {
          const category = categories.find(c => c.index === idx) || {
            type: 'comprehension',
            difficulty: 'medium',
          };

          return {
            question,
            type: this.validateType(category.type),
            difficulty: this.validateDifficulty(category.difficulty),
          };
        });
      }
    } catch (error) {
      console.error('Error categorizing questions:', error);
    }

    // Fallback: return questions with default categories
    return questions.map(question => ({
      question,
      type: 'comprehension' as const,
      difficulty: 'medium' as const,
    }));
  }

  private validateType(type: string): 'recall' | 'comprehension' | 'application' {
    const normalized = type.toLowerCase().trim();
    if (['recall', 'comprehension', 'application'].includes(normalized)) {
      return normalized as 'recall' | 'comprehension' | 'application';
    }
    return 'comprehension';
  }

  private validateDifficulty(difficulty: string): 'easy' | 'medium' | 'hard' {
    const normalized = difficulty.toLowerCase().trim();
    if (['easy', 'medium', 'hard'].includes(normalized)) {
      return normalized as 'easy' | 'medium' | 'hard';
    }
    return 'medium';
  }
}
