// Values interpolated into raw RFC 822 headers must never carry line breaks. A CR or LF
// would let a caller start a new header line (Bcc, Reply-To, ...) on a message that is
// sent from the CivicShield Gmail account.
export function headerValue(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

// Escapes a value used inside a quoted header parameter, e.g. filename="...".
export function quotedParameter(value: string) {
  return headerValue(value).replace(/["\\]/g, "_");
}
