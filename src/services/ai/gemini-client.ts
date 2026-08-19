// KhataHouse AI Client — built on LangChain + LangGraph.
// Multi-provider: Groq is the default (free + fast), Gemini is the fallback,
// and Gemini is always preferred for vision/document analysis.
// Server-only: imports @langchain/* which are not browser-safe.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import {
    HumanMessage,
    SystemMessage,
    AIMessage,
    type BaseMessage,
    type MessageContent,
} from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z, type ZodTypeAny } from 'zod';

type ChatModel = ChatGoogleGenerativeAI | ChatGroq | ChatOpenAI;
type ProviderKey = 'zenmux' | 'groq' | 'gemini';

const DEFAULT_PROVIDER: ProviderKey = 'zenmux';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const ZENMUX_BASE_URL = 'https://zenmux.ai/api/v1';
const ZENMUX_MODEL = 'deepseek/deepseek-v4-flash-free';

// ============================================
// Types
// ============================================

export interface AIResponse {
    success: boolean;
    text?: string;
    error?: string;
}

export interface AIAnalysis<T = unknown> {
    success: boolean;
    data?: T;
    reasoning?: string;
    error?: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface AIResponseWithActions extends AIResponse {
    actions?: { name: string; args: Record<string, unknown> }[];
}

// ============================================
// Helpers
// ============================================

// Lenient JSON-schema → zod conversion so tools keep accepting loosely-typed
// arguments from the model (e.g. amounts passed as strings).
function jsonSchemaToZod(schema: Record<string, unknown>): ZodTypeAny {
    const type = schema.type;
    let zodSchema: ZodTypeAny;

    switch (type) {
        case 'string':
            zodSchema = (schema.enum as string[] | undefined)?.length
                ? z.enum(schema.enum as [string, ...string[]]).catch((schema.enum as string[])[0])
                : z.string().catch('');
            break;
        case 'number':
        case 'integer':
            zodSchema = z.coerce.number().catch(0);
            break;
        case 'boolean':
            zodSchema = z.coerce.boolean().catch(false);
            break;
        case 'array': {
            const itemSchema = schema.items as Record<string, unknown> | undefined;
            zodSchema = z.array(itemSchema ? jsonSchemaToZod(itemSchema) : z.unknown()).catch([]);
            break;
        }
        case 'object': {
            const properties = (schema.properties as Record<string, Record<string, unknown>> | undefined) || {};
            const required = (schema.required as string[] | undefined) || [];
            const shape: Record<string, ZodTypeAny> = {};
            for (const [key, prop] of Object.entries(properties)) {
                let propSchema = jsonSchemaToZod(prop);
                if (typeof prop.description === 'string') {
                    propSchema = propSchema.describe(prop.description);
                }
                shape[key] = required.includes(key) ? propSchema : propSchema.optional();
            }
            zodSchema = z.object(shape);
            break;
        }
        default:
            zodSchema = z.any();
    }

    return zodSchema;
}

// Extract plain text from a LangChain message content (string or parts array).
function extractText(content: MessageContent | undefined | null): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return content
        .map((part) => (typeof part === 'string' ? part : 'text' in part && typeof part.text === 'string' ? part.text : ''))
        .join('');
}

// ============================================
// Chat session (kept for API compatibility)
// ============================================

export class ChatSession {
    private messages: BaseMessage[] = [];

    constructor(private readonly model: ChatModel, systemInstruction?: string) {
        if (systemInstruction) {
            this.messages.push(new SystemMessage(systemInstruction));
        }
    }

    async sendMessage(text: string): Promise<AIResponse> {
        this.messages.push(new HumanMessage(text));
        const result = await this.model.invoke(this.messages);
        this.messages.push(result);
        return { success: true, text: extractText(result.content) };
    }

    getHistory(): BaseMessage[] {
        return this.messages;
    }

    clear(): void {
        this.messages = [];
    }
}

// ============================================
// Multi-provider client
// ============================================

class GeminiClient {
    private geminiLlm: ChatGoogleGenerativeAI | null = null;
    private groqLlm: ChatGroq | null = null;
    private zenmuxLlm: ChatOpenAI | null = null;
    private provider: ProviderKey;
    private geminiApiKey: string;
    private groqApiKey: string;
    private zenmuxApiKey: string;
    private modelName: string = DEFAULT_MODEL;
    private groqModelName: string = DEFAULT_GROQ_MODEL;
    private zenmuxModel: string = ZENMUX_MODEL;

    constructor() {
        this.geminiApiKey = process.env.GEMINI_API_KEY || '';
        this.groqApiKey = process.env.GROQ_API_KEY || '';
        this.zenmuxApiKey = process.env.ZENMUX_API_KEY || '';
        const configured = process.env.AI_PROVIDER;
        this.provider = configured === 'groq' || configured === 'gemini' ? configured : DEFAULT_PROVIDER;
        this.groqModelName = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
        this.modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
        this.zenmuxModel = process.env.ZENMUX_MODEL || ZENMUX_MODEL;
        this.initialize();
    }

    // Initialize all providers (whichever keys are present)
    private initialize(): void {
        if (this.geminiApiKey) {
            this.geminiLlm = new ChatGoogleGenerativeAI({
                apiKey: this.geminiApiKey,
                model: this.modelName,
            });
        } else {
            this.geminiLlm = null;
        }

        if (this.groqApiKey) {
            this.groqLlm = new ChatGroq({
                apiKey: this.groqApiKey,
                model: this.groqModelName,
            });
        } else {
            this.groqLlm = null;
        }

        if (this.zenmuxApiKey) {
            this.zenmuxLlm = new ChatOpenAI({
                apiKey: this.zenmuxApiKey,
                model: this.zenmuxModel,
                configuration: { baseURL: ZENMUX_BASE_URL },
            });
        } else {
            this.zenmuxLlm = null;
        }
    }

    // Check if any provider is configured
    isConfigured(): boolean {
        if (!this.geminiLlm && !this.groqLlm && !this.zenmuxLlm) {
            console.warn('AI: no API key configured (set ZENMUX_API_KEY, GROQ_API_KEY and/or GEMINI_API_KEY)');
            return false;
        }
        return true;
    }

    // Set Gemini key at runtime (legacy API)
    setApiKey(apiKey: string): void {
        this.geminiApiKey = apiKey;
        this.initialize();
    }

    // Providers in preference order. Default: ZenMux → Groq → Gemini.
    // AI_PROVIDER=groq|gemini reorders; Gemini is always preferred first
    // for vision/document tasks.
    private orderedLlms(preferred?: ProviderKey): ChatModel[] {
        let order: (ChatModel | null)[];
        switch (preferred ?? this.provider) {
            case 'gemini':
                order = [this.geminiLlm, this.groqLlm, this.zenmuxLlm];
                break;
            case 'groq':
                order = [this.groqLlm, this.geminiLlm, this.zenmuxLlm];
                break;
            default:
                order = [this.zenmuxLlm, this.groqLlm, this.geminiLlm];
                break;
        }
        return order.filter((llm): llm is ChatModel => llm !== null);
    }

    // Run `run` against the preferred provider, transparently retrying on
    // the next ones if a call fails (rate limits, auth, downtime).
    private async withFallback<T>(
        run: (llm: ChatModel) => Promise<T>,
        preferred?: ProviderKey
    ): Promise<T> {
        const llms = this.orderedLlms(preferred);
        if (llms.length === 0) throw new Error('AI not configured');

        let lastError: unknown = null;
        for (const llm of llms) {
            try {
                return await run(llm);
            } catch (error) {
                lastError = error;
                const name = llm === this.zenmuxLlm ? 'zenmux' : llm === this.groqLlm ? 'groq' : 'gemini';
                console.error(
                    `AI provider (${name}) failed:`,
                    error instanceof Error ? error.message : error
                );
            }
        }
        throw lastError;
    }

    // Simple text generation
    async generate(prompt: string): Promise<AIResponse> {
        try {
            const text = await this.withFallback(async (llm) => {
                const result = await llm.invoke(prompt);
                return extractText(result.content);
            });
            return { success: true, text };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI generation failed';
            console.error('AI error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Generate with structured output (JSON)
    async generateJSON<T>(prompt: string): Promise<AIAnalysis<T>> {
        try {
            const jsonPrompt = `${prompt}

IMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.
The response must be parseable by JSON.parse() directly.`;

            const text = await this.withFallback(async (llm) => {
                const result = await llm.invoke(jsonPrompt);
                return extractText(result.content).trim();
            });

            // Clean up potential markdown code blocks
            const clean = text.startsWith('```')
                ? text.replace(/```json\n?/, '').replace(/\n?```$/, '')
                : text;

            const data = JSON.parse(clean) as T;
            return { success: true, data };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI JSON generation failed';
            console.error('AI JSON error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Create a chat session
    createChat(systemInstruction?: string): ChatSession | null {
        const llms = this.orderedLlms();
        if (llms.length === 0) return null;
        return new ChatSession(
            llms[0],
            systemInstruction || 'You are KhataHouse AI, a helpful financial assistant.'
        );
    }

    // Stream generation (for real-time chat)
    async streamGenerate(prompt: string, onChunk: (text: string) => void): Promise<AIResponse> {
        try {
            const fullText = await this.withFallback(async (llm) => {
                const stream = await llm.stream(prompt);
                let accumulated = '';
                for await (const chunk of stream) {
                    const chunkText = extractText(chunk.content);
                    if (!chunkText) continue;
                    accumulated += chunkText;
                    onChunk(chunkText);
                }
                return accumulated;
            });
            return { success: true, text: fullText };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI stream generation failed';
            return { success: false, error: errorMessage };
        }
    }

    // Generate with a file attachment (images/PDFs). Gemini always preferred —
    // it is the only provider here with full PDF + vision support.
    async generateWithFile(
        file: { mimeType: string; base64: string },
        prompt: string
    ): Promise<AIResponse> {
        try {
            const text = await this.withFallback(
                async (llm) => {
                    const result = await llm.invoke([
                        new HumanMessage({
                            content: [
                                { type: 'text', text: prompt },
                                {
                                    type: 'image_url',
                                    image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
                                },
                            ],
                        }),
                    ]);
                    return extractText(result.content);
                },
                'gemini'
            );
            return { success: true, text };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI file analysis failed';
            console.error('AI file error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Tool-calling agent loop via LangGraph — server-side only.
    // Builds a ReAct-style StateGraph (agent → tools → agent …) and runs it
    // until the model stops requesting tool calls.
    async generateWithTools(input: {
        prompt: string;
        systemInstruction?: string;
        tools: ToolDefinition[];
        execute: (name: string, args: Record<string, unknown>) => Promise<string>;
        maxIterations?: number;
    }): Promise<AIResponseWithActions> {
        const maxIterations = input.maxIterations || 5;

        try {
            return await this.withFallback(async (llm) => {
                const langchainTools = input.tools.map(
                    (tool) =>
                        new DynamicStructuredTool({
                            name: tool.name,
                            description: tool.description,
                            schema: jsonSchemaToZod(tool.parameters ?? { type: 'object', properties: {} }),
                            func: async (args) => {
                                try {
                                    return await input.execute(tool.name, args as Record<string, unknown>);
                                } catch (error: unknown) {
                                    return `ERROR: ${error instanceof Error ? error.message : 'Tool execution failed'}`;
                                }
                            },
                        })
                );

                const modelWithTools = llm.bindTools(langchainTools);
                const toolNode = new ToolNode(langchainTools);

                const MessagesAnnotation = Annotation.Root({
                    messages: Annotation<BaseMessage[]>({
                        reducer: (left, right) => left.concat(right),
                        default: () => [],
                    }),
                });

                const graph = new StateGraph(MessagesAnnotation)
                    .addNode('agent', async (state) => ({
                        messages: [await modelWithTools.invoke(state.messages)],
                    }))
                    .addNode('tools', toolNode)
                    .addEdge(START, 'agent')
                    .addConditionalEdges('agent', (state) => {
                        const last = state.messages[state.messages.length - 1];
                        if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
                            return 'tools';
                        }
                        return END;
                    })
                    .addEdge('tools', 'agent')
                    .compile();

                const messages: BaseMessage[] = [];
                if (input.systemInstruction) {
                    messages.push(new SystemMessage(input.systemInstruction));
                }
                messages.push(new HumanMessage(input.prompt));

                const finalState = await graph.invoke(
                    { messages },
                    { recursionLimit: maxIterations * 2 + 1 }
                );

                const allMessages = finalState.messages as BaseMessage[];
                const actions: { name: string; args: Record<string, unknown> }[] = [];
                for (const m of allMessages) {
                    if (m instanceof AIMessage && m.tool_calls) {
                        for (const tc of m.tool_calls) {
                            actions.push({ name: tc.name, args: tc.args ?? {} });
                        }
                    }
                }

                const last = allMessages[allMessages.length - 1];
                if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
                    // Model kept calling tools without finishing
                    return {
                        success: true,
                        text: 'I reached the tool-call limit. Please try asking in a simpler way.',
                        actions,
                    };
                }

                return { success: true, text: extractText(last?.content), actions };
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI tool generation failed';
            console.error('AI tool error:', errorMessage);
            return { success: false, error: errorMessage, actions: [] };
        }
    }
}

// Export singleton instance
export const geminiClient = new GeminiClient();