// src/Login.jsx

import { useState } from "react";
import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

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
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-white via-emerald-50/50 to-emerald-100/30 px-4">
      <div className="w-full max-w-88 rounded-2xl border border-emerald-100/90 bg-white/95 p-8 shadow-xl shadow-emerald-900/10 backdrop-blur-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg shadow-emerald-600/30">
            HT
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            హరికృష్ణ ట్రాన్స్‌పోర్ట్స్
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-emerald-600">
            Sign in
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="mb-1.5 block text-xs font-medium text-zinc-600"
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
              className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-xs font-medium text-zinc-600"
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
              className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-[0.99]"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
