function importedAssetPayload(id: string, payload?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dsh-tt-assets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('payloads');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction('payloads', payload === undefined ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('payloads');
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
        const asset = payload === undefined ? store.get(id) : store.put(payload, id);
        transaction.oncomplete = () => {
          db.close();
          resolve(asset.result);
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}
