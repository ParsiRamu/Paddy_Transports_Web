// src/Login.jsx

import { useState } from "react";
import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import loginBg from "./assets/login-bg.jpg";

function Login({ setIsLoggedIn }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const docRef = doc(db, "config", "auth");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        if (
          form.username === data.username &&
          form.password === data.password
        ) {
          localStorage.setItem("isLoggedIn", "true");
          setIsLoggedIn(true);
        } else {
          alert("Invalid credentials ❌");
        }
      } else {
        alert("No auth config found in Firebase");
      }
    } catch (error) {
      console.error(error);
      alert("Error logging in");
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#0b1f15] px-4 py-8">
      <img
        src={loginBg}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-[1.12] object-cover object-[50%_58%]"
      />

      {/* Subtle dark-green scrim keeps glass card text legible over misty sunlight */}
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/20 via-emerald-950/15 to-black/40"
        aria-hidden="true"
      />

      <main className="relative z-10 flex w-full max-w-88 flex-col items-center">
        <div className="w-full rounded-2xl border border-white/30 bg-white/14 p-8 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-[3px]">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#009966] text-lg font-bold tracking-tight text-white shadow-lg shadow-emerald-950/25">
              HT
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
               HARI KRISHNA TRANSPORTS
            </h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
              Sign in
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="mb-1.5 block text-xs font-medium text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                name="username"
                placeholder="Enter username"
                value={form.username}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/80 bg-white/95 px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-400/40"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-xs font-medium text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                name="password"
                placeholder="Enter password"
                value={form.password}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/80 bg-white/95 px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-400/40"
              />
            </div>

            <button
              type="submit"
              className="w-full cursor-pointer rounded-xl bg-[#009966] py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/25 transition-all hover:bg-[#059669] active:scale-[0.99]"
            >
              Login
            </button>
          </form>
        </div>

        <p className="mt-3.5 text-center text-[11px] font-medium tracking-wide text-white/75 drop-shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
          Secure access &middot; Harikrishna Transports
        </p>
      </main>
    </div>
  );
}

export default Login;
