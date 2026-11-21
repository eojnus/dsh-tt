// 角色扮演插件（根层入口）
//
// 根层只需要让客户端模块被发现：package.json 的 dsh.client + exports["./client"]。
// 真正的 Host 接管逻辑在 ./agent.js，由「角色扮演」preset 在 agent 作用域内加载，
// 以便声明 systemPrompt 注入。

import { GENERATION_PATH, handleAuxiliaryGeneration } from './lib/dsh-generation.js';
import { mountRoleplayStream } from './lib/roleplay-stream.js';
import { mountExtensionManager } from './lib/dsh-extensions.js';
import { join } from 'node:path';

export const name = 'dsh-tt-roleplay';

export function apply(ctx) {
  ctx.inject(['connection', 'profileContext'], (scope) => {
    const serveAssets = mountExtensionManager((route) => scope.connection.fetch.register(route), join(scope.profileContext.dir, 'dsh-tt-extensions'));
    scope.on('connection/request', serveAssets);
  });
  ctx.inject(['llm'], mountRoleplayStream);
  ctx.inject(['connection', 'llm', 'sessionController'], (scope) => {
    scope.connection.fetch.register({
      path: GENERATION_PATH, methods: ['POST'], requestBody: 'streaming',
      fetch: (request) => handleAuxiliaryGeneration(scope, request),
    });
  });
  try { console.log('[dsh-tt] 根层入口：客户端模块已注册，提示词接管由 preset 内的 @dsh-tt/roleplay/agent 负责。'); } catch { /* ignore */ }
}
