const form = document.getElementById("login");
const errore = document.getElementById("errore");
const btn = document.getElementById("entra");
document.getElementById("username").focus();

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const username = form.username.value.trim();
  const password = form.password.value;
  if (!username || !password) {
    errore.textContent = "Inserisci nome utente e password.";
    return;
  }
  btn.disabled = true;
  errore.textContent = "";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      location.replace("/");
      return;
    }
    const data = await res.json().catch(() => ({}));
    errore.textContent = data.error || `Errore del server (${res.status})`;
    form.password.select();
  } catch {
    errore.textContent = "Server non raggiungibile. Controlla la connessione.";
  } finally {
    btn.disabled = false;
  }
});
