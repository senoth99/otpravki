import {
  getSharedWorkspace,
  getWorkspaceRevision,
  subscribeWorkspace,
} from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribeWorkspace((state) => {
        send({ type: "workspace", workspace: state });
      });

      const heartbeat = setInterval(() => {
        void getWorkspaceRevision().then((revision) => {
          send({ type: "ping", revision });
        });
      }, 5_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      void getSharedWorkspace().then((workspace) => {
        if (workspace) {
          send({ type: "workspace", workspace });
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
