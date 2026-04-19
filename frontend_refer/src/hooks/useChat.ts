import { useState, useEffect } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  audioUrl?: string;
}

export interface StreamingLog {
  id: string;
  message: string;
  role: 'thought' | 'tool' | 'search';
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingLogs: StreamingLog[];
  topicId: string | null;
  currentAudio: HTMLAudioElement | null;
}

// A simple observable store to replace Zustand
class ChatStore {
  private state: ChatState = {
    messages: [],
    isStreaming: false,
    streamingLogs: [],
    topicId: null,
    currentAudio: null,
  };
  private listeners = new Set<(state: ChatState) => void>();

  getState() {
    return this.state;
  }

  setState(newState: Partial<ChatState>) {
    this.state = { ...this.state, ...newState };
    this.listeners.forEach(l => l(this.state));
  }

  subscribe(listener: (state: ChatState) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  stopAudio() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio = null;
      this.setState({ currentAudio: null });
    }
  }

  // --- ACTIONS ---
  addMessage(msg: Omit<ChatMessage, "id" | "timestamp">) {
    if (msg.role === 'user') {
      this.stopAudio();
    }
    this.setState({
      messages: [
        ...this.state.messages,
        { ...msg, id: crypto.randomUUID(), timestamp: Date.now() },
      ],
    });
  }

  updateMessageAudio(messageId: string, audioUrl: string) {
    this.setState({
      messages: this.state.messages.map((m) =>
        m.id === messageId ? { ...m, audioUrl } : m,
      ),
    });
  }

  setStreaming(isStreaming: boolean) {
    this.setState({
      isStreaming,
      streamingLogs: isStreaming ? this.state.streamingLogs : [],
    });
  }

  addStreamingLog(log: Omit<StreamingLog, "id">) {
    this.setState({
      streamingLogs: [...this.state.streamingLogs, { ...log, id: crypto.randomUUID() }],
    });
  }

  setTopicId(topicId: string | null) {
    this.setState({ topicId });
  }

  clear() {
    this.stopAudio();
    this.setState({ messages: [], isStreaming: false, streamingLogs: [], topicId: null });
  }
}

export const chatStore = new ChatStore();

// Custom hook to mimic Zustand
export function useChatStore<T>(selector: (state: ChatState) => T): T {
  const [value, setValue] = useState(() => selector(chatStore.getState()));

  useEffect(() => {
    return chatStore.subscribe((newState) => {
      setValue(selector(newState));
    });
  }, [selector]);

  return value;
}

let activeEventSource: EventSource | null = null;
let activeAudio: HTMLAudioElement | null = null;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function openSseStream(sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    if (activeEventSource && activeEventSource.url.includes(`/api/v1/chat/stream/${sessionId}`)) {
      return resolve();
    }

    if (activeEventSource) {
      activeEventSource.close();
    }

    const url = `${API_URL}/api/v1/chat/stream/${sessionId}`;
    const eventSource = new EventSource(url);
    activeEventSource = eventSource;

    eventSource.onopen = () => {
      console.log("[SSE] Connected to", url);
      resolve();
    };

    eventSource.onerror = (error) => {
      console.error("[SSE Error] Stream disconnected or failed", error);
      eventSource.close();
      activeEventSource = null;
      chatStore.setStreaming(false);
    };

    eventSource.addEventListener("Replies", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const text: string = data.text ?? "";
        if (!text) return;

        chatStore.addMessage({ role: "assistant", content: text });
        chatStore.setStreaming(false);
      } catch {
        console.warn("Failed to parse SSE Replies event", e.data);
      }
    });

    eventSource.addEventListener("TTSResult", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const rawUrl: string = data.audio_url ?? "";
        if (!rawUrl) return;

        // Backend returns /media/tts/... but serves files at /uploads/tts/... if config wasn't altered
        const audioUrl = API_URL + rawUrl.replace(/^\/media\//, "/uploads/");

        // Assign audio onto the last assistant message
        const msgs = chatStore.getState().messages;
        if (msgs.length > 0) {
           const lastMsgId = msgs[msgs.length - 1].id;
           chatStore.updateMessageAudio(lastMsgId, audioUrl);
        }

        activeAudio = new Audio(audioUrl);
        activeAudio.playbackRate = 1.1;

        activeAudio.play().catch((err) => console.warn("TTS autoplay blocked:", err));

        activeAudio.onended = () => {
          activeAudio = null;
        };
      } catch {
        console.warn("Failed to parse SSE TTSResult event", e.data);
      }
    });

    eventSource.addEventListener("ToolCall", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.tool_name === "search_web") {
          chatStore.addStreamingLog({
            role: 'search',
            message: `Searching for: ${data.arguments?.query || 'information'}`
          });
        } else {
          chatStore.addStreamingLog({
            role: 'tool',
            message: `Using tool: ${data.tool_name}`
          });
        }
      } catch (err) {
        console.warn("Failed to parse SSE ToolCall event", e.data);
      }
    });

    eventSource.addEventListener("Notif", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const msgStr = data.message || "";
        if (msgStr.startsWith("Error:")) {
          chatStore.addMessage({ role: "system", content: msgStr });
          chatStore.setStreaming(false);
        } else if (msgStr) {
          chatStore.addStreamingLog({
            role: 'thought',
            message: msgStr
          });
        }
      } catch {
        // ignore
      }
    });
  });
}

export async function sendChatMessage(content: string): Promise<void> {
  chatStore.addMessage({
    role: "user",
    content
  });
  chatStore.setStreaming(true);

  try {
    let currentTopicId = chatStore.getState().topicId;

    if (!currentTopicId) {
      currentTopicId = crypto.randomUUID();
      chatStore.setTopicId(currentTopicId);
    }

    await openSseStream(currentTopicId);

    const chatRes = await fetch(`${API_URL}/api/v1/chat/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_id: currentTopicId, message: content }),
    });

    if (!chatRes.ok) {
      throw new Error(`Chat request failed: ${chatRes.status}`);
    }
  } catch (error) {
    console.error("Failed to send chat message:", error);
    chatStore.addMessage({
      role: "system",
      content: error instanceof Error ? error.message : "Failed to connect to server. Please try again.",
    });
    chatStore.setStreaming(false);
  }
}
