import { generateText } from 'ai';
import pMap from 'p-map';
import * as z from 'zod';

/* eslint-disable autocorrect/issue */
const ENHANCE_PROMPT = `你是一个试卷 OCR 后处理助手。你将收到试卷中切出的题目或选项文本，你的任务是：

1. **代码标记**：如果文本包含代码（实现、伪代码、表达式、值的表示等均符合要求），应用 Markdown 行内代码或代码块语法包裹代码内容
2. **标记转换**：将以下仅表示排版效果的数学公式标记改为对应的 XML 标签：
   - 下加点（\\dot{}、\\ddot{}、\\underline{\\dot{}}、\\underset{\\cdot}{…}）→ <u> 包裹被标记的文字
   - 下划线（\\underline{}）→ <u> 包裹被标记的文字
   - 上划线（\\overline{}）→ <u> 包裹被标记的文字
   - 上标（^{} 或 ^x）→ <sup> 包裹上标内容
   - 下标（_{} 或 _x）→ <sub> 包裹下标内容
   - **一旦**包含其他成分，则保持原样不变
3. **代码风格修正**：如果存在有效的 Python 代码片段，则应格式化使其符合 PEP 8。但不得修改逻辑、变量名等实质内容，即使运行效果完全一致也不行
4. **换行符处理**：如果文本中存在被错误转义的换行符（\\n），应将其替换为真正的换行符。注意，有时确实需要显示 \\n 字符，这种情况下不要替换
5. **识别错误修正**：如果文本中存在明显的 OCR 识别错误（如字符误识别、缩进错误、全角半角符号错误），请修正这些错误，但仅限于不改变原意的范围内
6. **文本结构**：一行不能有多个选项，选项结束后应换行

注意，你需要仔细区分数学元素和代码，不可混用。

不得增加、删除或修改其他文本内容。直接返回处理后的文本，不要加序号或任何解释。

示例输入输出：
> 若数组a长度为3，则输出$ \\underset{.}{不} $$ \\underset{.}{为} 0.3$ 的是：
> 若数组\`a\`长度为\`3\`，则输出<u>不为</u> \`0.3\` 的是：

> A. d←0,data[i]<data[i+1]?
> A. \`d ← 0, data[i] < data[i + 1]?\`

> A. 使用 HTTPS 协议可以加强信息传输的安全性
> A. 使用 HTTPS 协议可以加强信息传输的安全性

> B. Print（round(0.1+0.2, I)）
> B. \`print(round(0.1 + 0.2, 1))\`

> A. [1,1,4,5,1,4]
> A. \`[1, 1, 4, 5, 1, 4]\`

> D. from decimal import Decimal print(Decimal("0.1")+Decimal("0.2"))
> D.
> \`\`\`
> from decimal import Decimal
> print(Decimal("0.1") + Decimal("0.2"))
> \`\`\`
`;
/* eslint-enable autocorrect/issue */

const CONCURRENCY = 10;
const bodySchema = z.object({
  texts: z.string().array(),
});

export default defineEventHandler(async (event) => {
  checkRateLimit(event);

  const { texts } = await readValidatedBody(event, bodySchema.parse);
  const config = useRuntimeConfig();
  // Process each text as a separate conversation to avoid response splitting
  const enhanced = await pMap(texts, async (t) => {
    const { text } = await generateText({
      model: tokenhub.chatModel(config.fixTextModel),
      system: ENHANCE_PROMPT,
      messages: [
        { role: 'user', content: t },
      ],
      temperature: 0.2,
      providerOptions: {
        openai: {
          thinking: { type: 'disabled' },
        },
      },
    });
    return text.trim() || t;
  }, { concurrency: CONCURRENCY });

  return { enhanced };
});
