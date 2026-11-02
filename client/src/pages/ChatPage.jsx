import React from "react";
import { api } from "../api.js";
import { getUser } from "../auth.js";
import { IconMessage, IconSend } from "../components/Icons.jsx";
import "./ChatPage.css";

function formatChatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ChatPage() {
  const currentUser = getUser();
  const [messages, setMessages] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const messagesContainerRef = React.useRef(null);
  const messagesRef = React.useRef([]);
  const scrollToBottomRef = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    let requestPending = false;
    let hasLoaded = false;
    const loadMessages = async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const response = await api.chatMessages();
        if (active) {
          const nextMessages = response.messages || [];
          const previousMessages = messagesRef.current;
          const changed =
            nextMessages.length !== previousMessages.length ||
            nextMessages.some((message, index) => message.id !== previousMessages[index]?.id);

          if (!hasLoaded || changed) {
            const container = messagesContainerRef.current;
            const distanceFromBottom = container
              ? container.scrollHeight - container.scrollTop - container.clientHeight
              : 0;
            if (!hasLoaded || distanceFromBottom < 80) {
              scrollToBottomRef.current = true;
            }
            messagesRef.current = nextMessages;
            setMessages(nextMessages);
          }
          hasLoaded = true;
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
        requestPending = false;
      }
    };

    setLoading(true);
    loadMessages();
    const timer = window.setInterval(loadMessages, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    if (!scrollToBottomRef.current) return;
    scrollToBottomRef.current = false;
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  const handleSend = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError("");
    try {
      const response = await api.sendChatMessage({ message });
      setDraft("");
      const nextMessages = [
        ...messagesRef.current.filter((item) => item.id !== response.message.id),
        response.message,
      ].slice(-100);
      messagesRef.current = nextMessages;
      scrollToBottomRef.current = true;
      setMessages(nextMessages);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-page">
      <header className="chat-page-header">
        <div className="chat-page-heading">
          <span className="chat-page-icon"><IconMessage size={22} /></span>
          <div>
            <h2>Grup Chat SISNERLING</h2>
            <p>Semua pengguna dan admin dapat membaca serta membalas pesan di ruang ini.</p>
          </div>
        </div>
      </header>
      <div className="chat-page-body">
        <section className="chat-page-panel">
          <div className="chat-page-conversation-heading">
            <strong>Ruang bersama</strong>
            <span>Pesan terlihat oleh semua akun yang memiliki akses.</span>
          </div>

          {error && <div className="chat-page-error" role="alert">{error}</div>}

          <div className="chat-page-messages" aria-live="polite" ref={messagesContainerRef}>
            {loading ? (
              <p className="chat-page-empty">Memuat pesan...</p>
            ) : messages.length ? (
              messages.map((message) => {
                const isMine = Number(message.sender_id) === Number(currentUser?.id);
                return (
                  <article
                    className={`chat-page-message${isMine ? " mine" : ""}`}
                    key={message.id}
                  >
                    <div className="chat-page-message-meta">
                      <strong>{isMine ? "Anda" : message.sender_name}</strong>
                      {message.sender_role !== "user" && (
                        <span className="chat-page-role">Admin</span>
                      )}
                      <time>{formatChatTime(message.created_at)}</time>
                    </div>
                    <p>{message.message}</p>
                  </article>
                );
              })
            ) : (
              <p className="chat-page-empty">
                Belum ada pesan. Mulai percakapan dengan mengirim pesan di bawah.
              </p>
            )}
          </div>

          <form className="chat-page-compose" onSubmit={handleSend}>
            <textarea
              aria-label="Tulis pesan"
              maxLength={2000}
              placeholder="Tulis pesan... (maks. 2.000 karakter)"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              disabled={sending}
              rows={2}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!draft.trim() || sending}
            >
              <IconSend size={15} />
              {sending ? "Mengirim..." : "Kirim"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
