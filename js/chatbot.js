(() => {
    const chatMarkup = `
        <section class="tribes-chat" aria-label="Janjeevan.store support chat">
            <div class="tribes-chat-panel" id="tribes-chat-panel" role="dialog" aria-label="Janjeevan.store support assistant" hidden>
                <header class="tribes-chat-header">
                    <span class="tribes-chat-mark" aria-hidden="true">J</span>
                    <div><strong>Janjeevan.store support</strong><small>Quick answers</small></div>
                    <button class="tribes-chat-close" type="button" aria-label="Close chat">&times;</button>
                </header>
                <div class="tribes-chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
                <div class="tribes-chat-suggestions" aria-label="Suggested questions">
                    <button type="button">Orders & payment</button>
                    <button type="button">Delivery help</button>
                    <button type="button">Merchant account</button>
                </div>
                <a class="tribes-chat-email" href="mailto:comtribes@gmail.com?subject=Janjeevan.store%20Support">Email support</a>
                <form class="tribes-chat-form">
                    <label class="tribes-chat-sr-only" for="tribes-chat-input">Type your question</label>
                    <input id="tribes-chat-input" type="text" maxlength="240" placeholder="Ask a question..." autocomplete="off" required>
                    <button type="submit" aria-label="Send message" title="Send message"><span aria-hidden="true">&#10148;</span></button>
                </form>
            </div>
            <button class="tribes-chat-toggle" type="button" aria-expanded="false" aria-controls="tribes-chat-panel">
                <span class="tribes-chat-icon" aria-hidden="true"></span><span>Chat</span>
            </button>
        </section>`;

    document.body.insertAdjacentHTML('beforeend', chatMarkup);

    const panel = document.getElementById('tribes-chat-panel');
    const toggle = document.querySelector('.tribes-chat-toggle');
    const close = document.querySelector('.tribes-chat-close');
    const messages = document.querySelector('.tribes-chat-messages');
    const form = document.querySelector('.tribes-chat-form');
    const input = document.getElementById('tribes-chat-input');

    const addMessage = (text, sender) => {
        const message = document.createElement('p');
        message.className = `tribes-chat-message ${sender}`;
        message.textContent = text;
        messages.append(message);
        messages.scrollTop = messages.scrollHeight;
    };

    const getReply = question => {
        const text = question.toLowerCase();
        if (/merchant|seller|sign.?in|login|password|register|account/.test(text)) {
            return 'Merchants can register from the Merchant Registration page, or sign in with their Merchant ID and password. For account help, email comtribes@gmail.com.';
        }
        if (/deliver|shipping|ship|track|dispatch/.test(text)) {
            return 'For delivery requests or delivery questions, email comtribes@gmail.com with your order details.';
        }
        if (/pay|payment|razorpay|order|checkout|cart|refund/.test(text)) {
            return 'Add products to your cart and choose the secure Razorpay checkout. For help with a payment or order, email comtribes@gmail.com with the details.';
        }
        if (/product|item|stock|price|catalog|shop/.test(text)) {
            return 'Browse the Shop page for current products and availability. Add an item to your cart to continue.';
        }
        if (/human|person|contact|support|help|email/.test(text)) {
            return 'You can reach the Janjeevan.store team at comtribes@gmail.com using the Email support link above.';
        }
        return 'I can help with shopping, payments, delivery, and merchant accounts. Choose a suggested question or email comtribes@gmail.com for anything else.';
    };

    const sendQuestion = question => {
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion) return;
        addMessage(trimmedQuestion, 'visitor');
        addMessage(getReply(trimmedQuestion), 'assistant');
    };

    addMessage('Hi! I can answer common questions about shopping, delivery, payments, and merchant accounts.', 'assistant');

    const setOpen = isOpen => {
        panel.hidden = !isOpen;
        toggle.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) input.focus();
        else toggle.focus();
    };

    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => setOpen(false));
    form.addEventListener('submit', event => {
        event.preventDefault();
        sendQuestion(input.value);
        input.value = '';
        input.focus();
    });
    document.querySelectorAll('.tribes-chat-suggestions button').forEach(button => {
        button.addEventListener('click', () => sendQuestion(button.textContent));
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) setOpen(false);
    });
})();