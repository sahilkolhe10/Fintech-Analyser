import { ChatGroq } from '@langchain/groq';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';

const zenmuxApiKey = process.env.ZENMUX_API_KEY!;
const groqApiKey = process.env.GROQ_API_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

const MessagesAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
});

async function runGraph(llm: BaseChatModel, label: string) {
    const tool = new DynamicStructuredTool({
        name: 'add_expense',
        description: 'Record a new expense',
        schema: z.object({
            amount: z.coerce.number(),
            description: z.string().default('Expense'),
            category: z.string().default('Other'),
        }),
        func: async (args) => `SAVED expense ${args.amount} (${args.category}) - ${args.description}`,
    });

    const modelWithTools = llm.bindTools ? llm.bindTools([tool]) : llm;
    const graph = new StateGraph(MessagesAnnotation)
        .addNode('agent', async (state) => ({ messages: [await modelWithTools.invoke(state.messages)] }))
        .addNode('tools', new ToolNode([tool]))
        .addEdge(START, 'agent')
        .addConditionalEdges('agent', (state) => {
            const last = state.messages[state.messages.length - 1];
            if (last instanceof AIMessage && last.tool_calls?.length) return 'tools';
            return END;
        })
        .addEdge('tools', 'agent')
        .compile();

    const res = await graph.invoke({
        messages: [
            new SystemMessage('You are FinManage AI. Use tools when asked.'),
            new HumanMessage('I spent 250 on lunch today. Please record it and confirm.'),
        ],
    });
    const last = res.messages[res.messages.length - 1];
    console.log(`[${label}] tool calls: ${(res.messages.filter((m) => m instanceof AIMessage && m.tool_calls?.length)).length}`);
    console.log(`[${label}] final: ${typeof last.content === 'string' ? last.content.slice(0, 120) : JSON.stringify(last.content).slice(0, 120)}`);
}

async function runLeg(label: string, fn: () => Promise<unknown>) {
    try {
        await fn();
        console.log(`[${label}] OK`);
    } catch (error) {
        console.log(`[${label}] FAILED: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    }
}

await runLeg('APP FACADE (fallback chain)', async () => {
    const { geminiClient } = await import('../src/services/ai/gemini-client');
    const res = await geminiClient.generateWithTools({
        prompt: 'I spent 250 on lunch today. Please record it and confirm.',
        systemInstruction: 'You are FinManage AI. Use the tool when asked.',
        tools: [
            {
                name: 'add_expense',
                description: 'Record a new expense',
                parameters: {
                    type: 'object',
                    properties: {
                        amount: { type: 'number', description: 'Amount spent' },
                        description: { type: 'string' },
                    },
                    required: ['amount'],
                },
            },
        ],
        execute: async (name, args) => `SAVED expense ${JSON.stringify(args)}`,
    });
    console.log(`[APP FACADE] success=${res.success} text=${res.text?.slice(0, 100)} actions=${res.actions?.length}`);
});

await runLeg('ZENMUX (direct)', () =>
    runGraph(new ChatOpenAI({
        apiKey: zenmuxApiKey,
        model: 'deepseek/deepseek-v4-flash-free',
        configuration: { baseURL: 'https://zenmux.ai/api/v1' },
    }), 'ZENMUX')
);
await runLeg('GROQ (direct)', () =>
    runGraph(new ChatGroq({ apiKey: groqApiKey, model: 'openai/gpt-oss-120b' }), 'GROQ')
);
await runLeg('GEMINI (direct)', () =>
    runGraph(new ChatGoogleGenerativeAI({ apiKey: geminiApiKey, model: 'gemini-2.5-flash' }), 'GEMINI')
);
console.log('SMOKE TEST OK');