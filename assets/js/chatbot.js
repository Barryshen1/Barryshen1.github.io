(() => {
  const root = document.querySelector("[data-chatbot]");
  if (!root) return;

  const elements = {
    panel: root.querySelector(".chatbot__panel"),
    toggle: root.querySelector(".chatbot__toggle"),
    messages: root.querySelector(".chatbot__messages"),
    input: root.querySelector("[data-chatbot-input]"),
    send: root.querySelector("[data-chatbot-send]"),
    clear: root.querySelector("[data-chatbot-clear]"),
    status: root.querySelector("[data-chatbot-status]"),
  };

  const state = {
    endpoint: (root.dataset.endpoint || "").trim(),
    title: root.dataset.title || "Chatbot",
    welcome: root.dataset.welcome || "Ask me anything about my work.",
    disclaimer: root.dataset.disclaimer || "",
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
    const bubble = document.createElement("div");
    const type = role === "user" ? "user" : "assistant";
    bubble.className = `chatbot__message chatbot__message--${type}`;
    bubble.textContent = content;
    bubble.setAttribute("data-role", type);
    elements.messages.appendChild(bubble);
    scrollMessages();
  };

  const addWelcome = () => {
    if (!elements.messages) return;
    elements.messages.innerHTML = "";
    appendMessage("assistant", state.welcome);
    state.history = [{ role: "assistant", content: state.welcome }];
  };

  const togglePanel = () => {
    if (!elements.panel || !elements.toggle) return;
    const willOpen = elements.panel.hasAttribute("hidden");
    if (willOpen) {
      elements.panel.removeAttribute("hidden");
      if (elements.input && !elements.input.disabled) elements.input.focus();
    } else {
      elements.panel.setAttribute("hidden", "");
    }
    elements.toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
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
  elements.toggle?.addEventListener("click", togglePanel);
  elements.send?.addEventListener("click", sendMessage);
  elements.clear?.addEventListener("click", clearConversation);

  elements.input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // Init
  addWelcome();
  if (!state.endpoint) {
    disableInput(true);
    setStatus(
      "Add your deployed proxy URL to `_config.yml` -> `chatbot.endpoint` to enable chat."
    );
  } else {
    setStatus(state.disclaimer || "Ready");
  }
})();
