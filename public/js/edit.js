function getId() {
  return new URLSearchParams(location.search).get("id");
}

async function initEdit() {
  if (!getUser()) {
    location.href = "login.html";
    return;
  }

  const form = document.getElementById("edit-form");
  const msg = document.getElementById("msg");
  const id = getId();

  if (id) {
    try {
      const snippet = await snippetApi.get(id);
      form.elements.title.value = snippet.title;
      form.elements.language.value = snippet.language;
      form.elements.description.value = snippet.description || "";
      form.elements.code.value = snippet.code;
      form.elements.is_public.checked = snippet.is_public;
      form.elements.tags.value = snippet.tags.map((tag) => tag.name).join(", ");
      document.querySelector("h1").textContent = "编辑片段";
    } catch (error) {
      showMessage(msg, error.message);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const body = {
      title: form.elements.title.value.trim(),
      language: form.elements.language.value,
      description: form.elements.description.value.trim() || null,
      code: form.elements.code.value,
      is_public: form.elements.is_public.checked,
      tags: form.elements.tags.value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };

    try {
      const saved = id
        ? await snippetApi.update(id, body)
        : await snippetApi.create(body);
      location.href = `snippet.html?id=${saved.id}`;
    } catch (error) {
      showMessage(msg, error.message);
    }
  });
}

document.addEventListener("DOMContentLoaded", initEdit);