import { type Plugin, tool } from "@opencode-ai/plugin";

/**
 * 给微信用户发送主动通知的工具。
 * 模型在会话中调用 wechat_notify → POST 到网关本地 hook（127.0.0.1:ZXK_HOOK_PORT）
 * → 网关按 sessionID 反查微信用户 → 转发。
 * ZXK_HOOK_PORT / ZXK_HOOK_TOKEN 由网关在 spawn serve 时写入环境。
 */
export const WechatNotifyPlugin: Plugin = async () => {
  return {
    tool: {
      wechat_notify: tool({
        description:
          "给用户发送一条微信消息。适合发送任务进度、中间结果、或需要用户注意的信息。",
        args: {
          text: tool.schema.string().describe("要发送的微信消息内容"),
        },
        async execute(args, context) {
          const port = process.env.ZXK_HOOK_PORT;
          const token = process.env.ZXK_HOOK_TOKEN;
          if (!port || !token) {
            return "通知通道未配置（缺少 ZXK_HOOK_PORT / ZXK_HOOK_TOKEN）";
          }
          try {
            const res = await fetch(`http://127.0.0.1:${port}/notify`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ sessionID: context.sessionID, message: args.text }),
            });
            if (res.ok) return "已发送给用户";
            return `发送失败: HTTP ${res.status}`;
          } catch (e) {
            return `发送失败: ${(e as Error).message}`;
          }
        },
      }),
    },
  };
};
