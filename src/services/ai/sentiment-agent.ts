// Sentiment Analysis Agent for FinManage
// AI-powered market sentiment analysis using news and social signals

import { geminiClient, AIAnalysis } from './gemini-client';

// ============================================
// Types
// ============================================

export interface SentimentScore {
    overall: 'bullish' | 'bearish' | 'neutral';
    score: number; // -100 to +100
    confidence: number; // 0-100
}

export interface StockSentiment {
    symbol: string;
    name: string;
    sentiment: SentimentScore;
    keyFactors: {
        factor: string;
        impact: 'positive' | 'negative' | 'neutral';
        importance: 'high' | 'medium' | 'low';
    }[];
    newsHighlights: {
        headline: string;
        sentiment: 'positive' | 'negative' | 'neutral';
        source: string;
    }[];
    recommendation: string;
    lastUpdated: Date;
}

export interface MarketMood {
    overall: 'bullish' | 'bearish' | 'neutral';
    score: number;
    fearGreedIndex: number; // 0-100
    marketStatus: string;
    sectors: {
        name: string;
        sentiment: 'bullish' | 'bearish' | 'neutral';
    }[];
    keyIndicators: string[];
    summary: string;
}

// ============================================
// Sentiment Agent
// ============================================

class SentimentAgent {
    // Analyze sentiment for a specific stock
    async analyzeStockSentiment(
        symbol: string,
        name: string,
        news: { title: string; source: string; pubDate: string }[]
    ): Promise<AIAnalysis<StockSentiment>> {
        const newsData = news.slice(0, 10).map((n) => ({
            headline: n.title,
            source: n.source,
            date: n.pubDate,
        }));

        const prompt = `Analyze market sentiment for ${name} (${symbol}) based on recent news:

NEWS HEADLINES:
${JSON.stringify(newsData, null, 2)}

Provide a comprehensive sentiment analysis in JSON:
{
  "sentiment": {
    "overall": "<bullish|bearish|neutral>",
    "score": <number -100 to +100>,
    "confidence": <number 0-100>
  },
  "keyFactors": [
    {
      "factor": "<description>",
      "impact": "<positive|negative|neutral>",
      "importance": "<high|medium|low>"
    }
  ],
  "newsHighlights": [
    {
      "headline": "<headline>",
      "sentiment": "<positive|negative|neutral>",
      "source": "<source>"
    }
  ],
  "recommendation": "<brief trading recommendation based on sentiment>"
}

Consider: news tone, market reactions, sector trends, company-specific factors.
Max 5 key factors and 5 news highlights.`;

        const result = await geminiClient.generateJSON<{
            sentiment: SentimentScore;
            keyFactors: { factor: string; impact: 'positive' | 'negative' | 'neutral'; importance: 'high' | 'medium' | 'low' }[];
            newsHighlights: { headline: string; sentiment: 'positive' | 'negative' | 'neutral'; source: string }[];
            recommendation: string;
        }>(prompt);

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        return {
            success: true,
            data: {
                symbol,
                name,
                sentiment: result.data.sentiment,
                keyFactors: result.data.keyFactors,
                newsHighlights: result.data.newsHighlights,
                recommendation: result.data.recommendation,
                lastUpdated: new Date(),
            },
        };
    }

    // Analyze overall market mood
    async analyzeMarketMood(
        indices: { name: string; change: number; changePercent: number }[],
        topNews: { title: string }[]
    ): Promise<AIAnalysis<MarketMood>> {
        const prompt = `Analyze overall market mood based on this data:

MARKET INDICES:
${JSON.stringify(indices, null, 2)}

TOP MARKET NEWS:
${JSON.stringify(topNews.slice(0, 5), null, 2)}

Provide market mood analysis in JSON:
{
  "overall": "<bullish|bearish|neutral>",
  "score": <number -100 to +100>,
  "fearGreedIndex": <number 0-100 where 0 is extreme fear, 100 is extreme greed>,
  "marketStatus": "<brief market status description>",
  "sectors": [
    {"name": "<sector>", "sentiment": "<bullish|bearish|neutral>"}
  ],
  "keyIndicators": ["<indicator 1>", "<indicator 2>", ...max 5],
  "summary": "<2-3 sentence market summary>"
}

Analyze based on: index movements, sector rotation, news sentiment, global factors.`;

        return geminiClient.generateJSON<MarketMood>(prompt);
    }

    // Quick sentiment check for a list of stocks
    async quickSentimentCheck(
        symbols: string[]
    ): Promise<AIAnalysis<Map<string, 'bullish' | 'bearish' | 'neutral'>>> {
        const prompt = `Provide quick sentiment assessment for these stocks based on current market conditions:
${symbols.join(', ')}

Respond with JSON object mapping symbol to sentiment:
{
  "${symbols[0]}": "<bullish|bearish|neutral>",
  ...
}

Base on: general market knowledge, sector trends, recent performance.`;

        const result = await geminiClient.generateJSON<Record<string, 'bullish' | 'bearish' | 'neutral'>>(prompt);

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        const sentimentMap = new Map<string, 'bullish' | 'bearish' | 'neutral'>();
        for (const [symbol, sentiment] of Object.entries(result.data)) {
            sentimentMap.set(symbol, sentiment);
        }

        return { success: true, data: sentimentMap };
    }

    // Get sentiment-based trading signals
    async getTradingSignals(
        symbol: string,
        sentiment: SentimentScore,
        technicalData?: { rsi?: number; macdSignal?: 'bullish' | 'bearish' | 'neutral' }
    ): Promise<AIAnalysis<{
        signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
        confidence: number;
        reasoning: string;
        timeframe: string;
    }>> {
        const prompt = `Generate trading signal for ${symbol}:

SENTIMENT:
${JSON.stringify(sentiment, null, 2)}

${technicalData ? `TECHNICAL INDICATORS:
RSI: ${technicalData.rsi || 'N/A'}
MACD Signal: ${technicalData.macdSignal || 'N/A'}` : ''}

Provide trading signal in JSON:
{
  "signal": "<strong_buy|buy|hold|sell|strong_sell>",
  "confidence": <number 0-100>,
  "reasoning": "<brief explanation>",
  "timeframe": "<short-term|medium-term|long-term>"
}

Consider sentiment alignment with technicals. Be conservative with strong signals.`;

        return geminiClient.generateJSON<{
            signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
            confidence: number;
            reasoning: string;
            timeframe: string;
        }>(prompt);
    }
}

// Export singleton instance
export const sentimentAgent = new SentimentAgent();
