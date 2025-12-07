import { NextResponse } from "next/server";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

const SYSTEM_MESSAGE = {
  role: "system",
  content: `You are an AI Study Assistant designed to help students with their study planning, time management, and learning strategies. You provide personalized advice based on their study goals, topics, and schedules.

Key guidelines:
- Help students create effective study strategies for their courses and exams
- Provide time management tips and productivity techniques
- Suggest study methods based on topic difficulty and priority
- Offer motivation and stress management advice during exam preparation
- Recommend study techniques like Pomodoro, active recall, spaced repetition, etc.
- Help with specific subject areas and answer study-related questions
- Be encouraging, supportive, and practical in your advice
- Keep responses concise but helpful (2-4 sentences typically)
-use bullet points or numbered lists for clarity when needed
- use emojis sparingly to enhance engagement
- Consider the student's goals (exams, projects, assignments, etc.) when giving advice`
};

// ✅ POST method for App Router
export async function POST(req) {
  try {
    const { message, conversationHistory } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const messages = [SYSTEM_MESSAGE];

    // Add recent conversation history (last 10 messages)
    if (conversationHistory?.length) {
      const recentHistory = conversationHistory
        .slice(-10)
        .map((msg) => ({
          role: msg.type === "user" ? "user" : "assistant",
          content: msg.content,
        }));
      messages.push(...recentHistory);
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // ✅ Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await cerebras.chat.completions.create({
            messages,
            model: "gpt-oss-120b",
            stream: true,
            max_completion_tokens: 2048,
            temperature: 0.2,
            reasoning_effort: "medium",
            top_p: 1,
          });

          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }
          }

          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Streaming error:", err);
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                error: "Failed to get AI response",
                details: err.message,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}
