/**
 * 预览渲染的生命周期管理。
 *
 * 切项目时，上一次项目排队的 WASM 渲染任务可能还在跑；它们持有旧 artifact，
 * 即使 runWithSession 会自动 free session，也会无谓占用 native 资源并可能把
 * 旧页面画到新容器上。这里用「代次」标记：切项目递增，旧任务在真正创建
 * session 前检查并退出。
 */

let generation = 0;

/** 递增代次，使所有在途渲染任务失效。返回新代次。 */
export function bumpRenderGeneration(): number {
  generation += 1;
  return generation;
}

export function currentRenderGeneration(): number {
  return generation;
}

/** 项目卡片封面的缓存；切项目时一并释放（dataURL 字符串也可能很大）。 */
const coverCache = new Map<string, Promise<string | null>>();

export function getCoverCache(): Map<string, Promise<string | null>> {
  return coverCache;
}

export function clearCoverCache(): void {
  coverCache.clear();
}
