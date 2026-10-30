import { useState } from "react";

import { loginUser, registerUser } from "../services/api.js";

function AuthForm({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const credentials = registering
        ? { email, password, password_confirmation: passwordConfirmation }
        : { email, password };
      const user = registering
        ? await registerUser(credentials)
        : await loginUser(credentials);
      onAuthenticated(user);
    } catch (authError) {
      setError(authError.message || "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    setError("");
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-heading">
      <p className="eyebrow">Your private library</p>
      <h2 id="auth-heading">{registering ? "Create your account" : "Sign in"}</h2>
      <p>
        {registering
          ? "Create an account to keep your catalog private to you."
          : "Sign in to access your personal library."}
      </p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="auth-email">Email address</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={320}
          disabled={busy}
        />
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          autoComplete={registering ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={registering ? 12 : 1}
          maxLength={128}
          disabled={busy}
        />
        {registering && (
          <>
            <label htmlFor="auth-password-confirmation">Confirm password</label>
            <input
              id="auth-password-confirmation"
              type="password"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              minLength={12}
              maxLength={128}
              disabled={busy}
            />
            <p className="auth-hint">Use at least 12 characters.</p>
          </>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Please wait..." : registering ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="auth-mode-toggle">
        {registering ? "Already have an account?" : "New to AYO?"}{" "}
        <button
          type="button"
          className="auth-text-button"
          onClick={() => changeMode(registering ? "login" : "register")}
          disabled={busy}
        >
          {registering ? "Sign in" : "Create an account"}
        </button>
      </p>
      <p className="prototype-notice">
        This prototype still uploads and stores imported files on its backend.
        Local-only import is not available yet.
      </p>
    </section>
  );
}

export default AuthForm;
