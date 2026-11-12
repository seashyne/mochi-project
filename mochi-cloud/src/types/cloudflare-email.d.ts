// Ambient module declaration for Cloudflare Workers native Email Routing runtime binding
declare module 'cloudflare:email' {
  export class EmailMessage {
    constructor(from: string, to: string, raw: ReadableStream | string);
  }
}
