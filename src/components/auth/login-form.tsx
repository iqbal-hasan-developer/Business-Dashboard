"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Sparkles } from "lucide-react";
import { signIn, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: LoginState = {};

const DEMO_EMAIL = "demo@nexanotion.online";
const DEMO_PASSWORD = "DemoUser2026!";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(signIn, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleFillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3.5 text-xs text-sky-950">
        <div className="flex items-center justify-between font-medium">
          <div className="flex items-center gap-1.5 text-sky-900">
            <Sparkles className="size-3.5 text-sky-600" />
            <span className="font-semibold">Interactive Demo Access</span>
          </div>
          <button
            type="button"
            onClick={handleFillDemo}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-xs hover:bg-sky-700 active:scale-95 transition"
          >
            <KeyRound className="size-3" />
            Auto-fill
          </button>
        </div>
        <div className="mt-2.5 space-y-1 font-mono text-[11px] text-sky-900/90">
          <div className="flex items-center justify-between">
            <span className="font-sans text-sky-700">Email:</span>
            <span className="font-semibold select-all">{DEMO_EMAIL}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-sans text-sky-700">Password:</span>
            <span className="font-semibold select-all">{DEMO_PASSWORD}</span>
          </div>
        </div>
        <div className="mt-2.5 border-t border-sky-200/70 pt-2 text-[10.5px] text-sky-800/90 flex items-center justify-between">
          <span>Sandbox Preview</span>
          <span className="rounded bg-sky-200/60 px-1.5 py-0.5 font-medium text-sky-900">Sample Data</span>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={searchParams.get("next") ?? "/dashboard"} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
