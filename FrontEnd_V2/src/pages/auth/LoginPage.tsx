import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "@/routes/RoutePaths";

export function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname ?? ROUTES.DASHBOARD;

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        await login({ email: email.trim(), password });
        navigate(from, { replace: true });
    }

    return (
        <h1>
            Login Page
        </h1>
    );
}