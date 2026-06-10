import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';

/**
 * Sinh nội dung comment đầu tiên cho 1 bài đăng bằng OpenAI Chat Completions.
 * - Dùng `fetch` (global, Node 18+) — không thêm SDK ngoài, đồng nhất với cách
 *   gọi Graph API ở module này.
 * - Trả về plain text (đúng những gì sẽ hiển thị trên Facebook): không markdown,
 *   không dấu ngoặc kép bao quanh.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_OUTPUT = 600; // ký tự tối đa cho 1 comment gợi ý

export const isOpenAIConfigured = (): boolean => Boolean(env.OPENAI_API_KEY);

interface GenerateCommentArgs {
  /** Nội dung bài viết để AI bám theo. */
  message: string;
  /** Tên Page (giúp AI xưng hô đúng giọng thương hiệu). */
  pageName?: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/** Bỏ cặp ngoặc kép/đơn bao quanh nếu model lỡ trả về. */
const stripWrappingQuotes = (text: string): string =>
  text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();

export const generateFirstComment = async ({
  message,
  pageName,
}: GenerateCommentArgs): Promise<string> => {
  if (!isOpenAIConfigured()) {
    throw ApiError.badRequest(
      'Chưa cấu hình OpenAI. Thêm OPENAI_API_KEY vào .env để dùng gợi ý bằng AI.',
    );
  }
  const content = message?.trim();
  if (!content) {
    throw ApiError.badRequest('Cần có nội dung bài viết để AI gợi ý comment.');
  }

  const systemPrompt = [
    'Bạn là người quản lý fanpage Facebook, viết tiếng Việt tự nhiên, thân thiện.',
    'Nhiệm vụ: viết MỘT bình luận đầu tiên (first comment) để chính chủ Page đăng dưới bài viết.',
    'Yêu cầu:',
    '- Bám sát nội dung bài viết, bổ sung giá trị (kêu gọi tương tác, hỏi ý kiến, nhắc CTA, hoặc chèn hashtag hợp lý).',
    '- Ngắn gọn 1-3 câu, giọng gần gũi, có thể dùng emoji vừa phải.',
    '- Chỉ trả về đúng nội dung bình luận, KHÔNG giải thích, KHÔNG bọc trong dấu ngoặc kép.',
    pageName ? `- Tên Page: "${pageName}".` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.9,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Nội dung bài viết:\n"""\n${content}\n"""` },
        ],
      }),
    });
  } catch (err) {
    logger.warn({ err }, 'OpenAI: lỗi mạng khi gợi ý comment');
    throw ApiError.badRequest('Không kết nối được tới OpenAI. Vui lòng thử lại sau.');
  }

  const json = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
  if (!res.ok || !json || json.error) {
    logger.warn(
      { status: res.status, error: json?.error?.message },
      'OpenAI: gợi ý comment bị từ chối',
    );
    if (res.status === 401) {
      throw ApiError.badRequest('OPENAI_API_KEY không hợp lệ hoặc đã bị thu hồi.');
    }
    if (res.status === 429) {
      throw ApiError.badRequest('OpenAI đang quá tải hoặc hết hạn mức. Vui lòng thử lại sau.');
    }
    throw ApiError.badRequest(json?.error?.message || 'AI không gợi ý được, vui lòng thử lại.');
  }

  const raw = json.choices?.[0]?.message?.content ?? '';
  const comment = stripWrappingQuotes(raw).slice(0, MAX_OUTPUT);
  if (!comment) {
    throw ApiError.badRequest('AI trả về rỗng, vui lòng thử lại.');
  }
  return comment;
};
