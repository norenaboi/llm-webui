const attachmentStore = (() => {
  const DB_NAME = "llm_webui_attachments";
  const STORE_NAME = "attachments";
  const DB_VERSION = 1;
  let dbPromise;

  function open() {
    if (!window.indexedDB) {
      return Promise.reject(new Error("IndexedDB is not available"));
    }
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open attachment storage"));
      request.onblocked = () => reject(new Error("Attachment storage is blocked"));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
    return dbPromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Attachment storage failed"));
    });
  }

  async function putImage(attachment) {
    if (attachment.attachmentId) return attachment.attachmentId;
    if (typeof attachment.dataUrl !== "string" || !attachment.dataUrl) {
      throw new Error(`Image ${attachment.name || "(unnamed)"} has no data`);
    }

    const response = await fetch(attachment.dataUrl);
    const blob = await response.blob();
    const id = crypto.randomUUID();
    const db = await open();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    await requestResult(
      transaction.objectStore(STORE_NAME).put({
        id,
        blob,
        name: attachment.name || "Image",
        mimeType: attachment.mimeType || blob.type,
        size: blob.size,
        createdAt: new Date().toISOString(),
      }),
    );
    return id;
  }

  async function get(id) {
    if (!id) return null;
    const db = await open();
    const transaction = db.transaction(STORE_NAME, "readonly");
    return (await requestResult(transaction.objectStore(STORE_NAME).get(id))) || null;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read stored image"));
      reader.readAsDataURL(blob);
    });
  }

  async function hydrateAttachment(attachment) {
    if (attachment.type !== "image" || attachment.dataUrl) return attachment;
    if (!attachment.attachmentId) return attachment;
    const record = await get(attachment.attachmentId);
    if (!record?.blob) return attachment;
    return {
      ...attachment,
      name: attachment.name || record.name,
      mimeType: attachment.mimeType || record.mimeType,
      dataUrl: await blobToDataUrl(record.blob),
    };
  }

  async function hydrateAttachments(attachments = []) {
    return Promise.all(attachments.map(hydrateAttachment));
  }

  async function hydrateMessages(messages = []) {
    return Promise.all(
      messages.map(async (message) => ({
        ...message,
        attachments: await hydrateAttachments(message.attachments || []),
      })),
    );
  }

  async function deleteMany(ids) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return;
    const db = await open();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await Promise.all(uniqueIds.map((id) => requestResult(store.delete(id))));
  }

  async function reconcile(referencedIds) {
    const referenced = new Set(referencedIds);
    const db = await open();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const keys = await requestResult(transaction.objectStore(STORE_NAME).getAllKeys());
    await deleteMany(keys.filter((id) => !referenced.has(id)));
  }

  return {
    putImage,
    hydrateAttachment,
    hydrateAttachments,
    hydrateMessages,
    reconcile,
  };
})();
