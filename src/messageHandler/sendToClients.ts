/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

/**
 * Helper function to send message to client(s)
 */
const sendToClients = async (eventSource: MessagePort | Client | ServiceWorker | null, message: any) => {
  // First, try to send directly to the source if available
  if (eventSource && 'postMessage' in eventSource) {
    try {
      (eventSource as Client).postMessage(message);
      console.log('[SW] Message sent via event.source');
      return;
    } catch (error) {
      console.warn('[SW] Failed to send via event.source:', error);
    }
  }

  // Fallback: try to get clients, with retry logic
  let clients = await self.clients.matchAll({ includeUncontrolled: true });
  console.log('[SW] Found', clients.length, 'clients on first attempt');
  
  // If no clients, wait a bit and try again
  if (clients.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
    clients = await self.clients.matchAll({ includeUncontrolled: true });
    console.log('[SW] Found', clients.length, 'clients on second attempt');
  }
  
  // If still no clients, wait a bit more
  if (clients.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 200));
    clients = await self.clients.matchAll({ includeUncontrolled: true });
    console.log('[SW] Found', clients.length, 'clients on third attempt');
  }

  if (clients.length > 0) {
    clients.forEach((client) => {
      client.postMessage(message);
    });
    console.log('[SW] Message sent to', clients.length, 'clients');
  } else {
    console.warn('[SW] No clients available to send message to');
  }
};

export default sendToClients;
