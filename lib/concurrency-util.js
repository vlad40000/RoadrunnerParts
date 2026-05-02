/**
 * Concurrency Helper
 * Runs tasks with a maximum number of concurrent promises.
 */

export async function runWithConcurrency(items, limit, fn) {
  const results = [];
  const active = new Set();
  
  for (const item of items) {
    if (active.size >= limit) {
      await Promise.race(active);
    }
    
    const promise = fn(item).then(res => {
      active.delete(promise);
      return res;
    });
    
    active.add(promise);
    results.push(promise);
  }
  
  return Promise.all(results);
}
