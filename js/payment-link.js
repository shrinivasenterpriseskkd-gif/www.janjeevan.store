const upiIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/;

export const normalizePaymentLink = value => {
    const input = String(value ?? "").trim();
    if (!input) return "";
    if (upiIdPattern.test(input)) return `upi://pay?pa=${encodeURIComponent(input)}`;
    const compactUpiId = /^upi:\/\/([^/?#]+)$/i.exec(input);
    if (compactUpiId && upiIdPattern.test(compactUpiId[1])) {
        return `upi://pay?pa=${encodeURIComponent(compactUpiId[1])}`;
    }

    let url;
    try {
        url = new URL(input);
    } catch {
        return null;
    }

    if (url.protocol === "https:" && url.hostname && !url.username && !url.password) return input;
    if (url.protocol !== "upi:" || url.hostname.toLowerCase() !== "pay" || url.username || url.password) return null;
    return upiIdPattern.test(url.searchParams.get("pa") || "") ? input : null;
};