(() => {
  const root = document.querySelector("[data-chatbot]");
  if (!root) return;

  const elements = {
    panel: root.querySelector(".chatbot__panel"),
    open: root.querySelector("[data-chatbot-open]"),
    close: root.querySelector("[data-chatbot-close]"),
    messages: root.querySelector(".chatbot__messages"),
    input: root.querySelector("[data-chatbot-input]"),
    send: root.querySelector("[data-chatbot-send]"),
    reset: root.querySelector("[data-chatbot-reset]"),
    status: root.querySelector("[data-chatbot-status]"),
  };

  const state = {
    endpoint: (root.dataset.endpoint || "").trim(),
    title: root.dataset.title || "Chatbot",
    welcome: root.dataset.welcome || "",
    disclaimer: root.dataset.disclaimer || "",
    assistantName: root.dataset.assistantName || "Assistant",
    assistantInitials: root.dataset.assistantInitials || "AI",
    assistantAvatar: root.dataset.assistantAvatar || "",
    sending: false,
    history: [],
  };

  const setStatus = (text) => {
    if (elements.status) elements.status.textContent = text;
  };

  const disableInput = (disabled) => {
    if (elements.input) elements.input.disabled = disabled;
    if (elements.send) elements.send.disabled = disabled;
  };

  const scrollMessages = () => {
    if (elements.messages) {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  };

  const appendMessage = (role, content) => {
    if (!elements.messages || !content) return;

    const isUser = role === "user";
    const wrapper = document.createElement("div");
    wrapper.className = `chatbot__message chatbot__message--${
      isUser ? "user" : "assistant"
    }`;

    const body = document.createElement("div");
    body.className = "chatbot__message-body";

    const name = document.createElement("p");
    name.className = "chatbot__message-name";
    name.textContent = isUser ? "You" : state.assistantName;

    const text = document.createElement("p");
    text.className = "chatbot__message-text";
    text.textContent = content;

    body.appendChild(name);
    body.appendChild(text);
    wrapper.appendChild(body);

    elements.messages.appendChild(wrapper);
    scrollMessages();
  };

  const addWelcome = () => {
    if (!elements.messages) return;
    elements.messages.innerHTML = "";
    if (state.welcome) {
      appendMessage("assistant", state.welcome);
      state.history = [{ role: "assistant", content: state.welcome }];
    } else {
      state.history = [];
    }
  };

  const isPanelOpen = () =>
    Boolean(elements.panel && !elements.panel.hasAttribute("hidden"));

  const ensureClosed = () => {
    if (!elements.panel) return;
    elements.panel.setAttribute("hidden", "");
    root.classList.remove("chatbot--open");
    elements.open?.setAttribute("aria-expanded", "false");
  };

  const openPanel = () => {
    if (!elements.panel) return;
    elements.panel.removeAttribute("hidden");
    elements.open?.setAttribute("aria-expanded", "true");
    root.classList.add("chatbot--open");
    if (elements.input && !elements.input.disabled) elements.input.focus();
  };

  const closePanel = () => {
    if (!elements.panel) return;
    elements.panel.setAttribute("hidden", "");
    elements.open?.setAttribute("aria-expanded", "false");
    root.classList.remove("chatbot--open");
  };

  const togglePanel = () => {
    if (isPanelOpen()) {
      closePanel();
    } else {
      openPanel();
    }
  };

  const sendMessage = async () => {
    if (!state.endpoint || state.sending) return;
    const prompt = (elements.input?.value || "").trim();
    if (!prompt) return;

    appendMessage("user", prompt);
    state.history.push({ role: "user", content: prompt });
    elements.input.value = "";

    setStatus("Thinking with Gemini...");
    disableInput(true);
    state.sending = true;

    try {
      const payload = { messages: state.history };
      const response = await fetch(state.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      const reply = data.reply || data.text || data.message;
      if (!reply) throw new Error("The chatbot proxy did not return a reply.");

      state.history.push({ role: "assistant", content: reply });
      appendMessage("assistant", reply);
      setStatus("Ready");
    } catch (error) {
      setStatus(error.message || "Something went wrong.");
      appendMessage(
        "assistant",
        "Sorry, I could not reach the chatbot service. Please try again."
      );
    } finally {
      state.sending = false;
      if (state.endpoint) disableInput(false);
    }
  };

  const clearConversation = () => {
    if (state.sending) return;
    addWelcome();
    setStatus(state.disclaimer || "Ready");
  };

  // Events
  elements.open?.addEventListener("click", togglePanel);
  elements.close?.addEventListener("click", closePanel);
  elements.send?.addEventListener("click", sendMessage);
  elements.reset?.addEventListener("click", clearConversation);

  elements.input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // Init
  addWelcome();
  ensureClosed();
  if (!state.endpoint) {
    disableInput(true);
    setStatus(
      state.disclaimer || "Chat is offline until a backend endpoint is configured."
    );
  } else {
    setStatus(state.disclaimer || "Ready");
  }
})();
