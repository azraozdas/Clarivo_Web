// Clarivo — auth.js

// =============================================
// 0. TOAST NOTIFICATION
// =============================================

function showToast(message, type) {
    var existing = document.getElementById("authToast");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "authToast";
    toast.textContent = message;
    toast.style.cssText = [
        "position:fixed",
        "bottom:28px",
        "left:50%",
        "transform:translateX(-50%) translateY(20px)",
        "background:" + (type === "success" ? "rgba(66,214,181,0.15)" : "rgba(230,106,115,0.15)"),
        "border:1px solid " + (type === "success" ? "rgba(66,214,181,0.35)" : "rgba(230,106,115,0.35)"),
        "color:" + (type === "success" ? "#42D6B5" : "#E66A73"),
        "padding:12px 24px",
        "border-radius:50px",
        "font-family:'Inter',Arial,sans-serif",
        "font-size:14px",
        "font-weight:500",
        "z-index:9999",
        "backdrop-filter:blur(10px)",
        "-webkit-backdrop-filter:blur(10px)",
        "box-shadow:0 8px 32px rgba(0,0,0,0.4)",
        "transition:opacity 0.3s ease,transform 0.3s ease",
        "opacity:0"
    ].join(";");

    document.body.appendChild(toast);
    requestAnimationFrame(function () {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(0)";
    });

    setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(10px)";
        setTimeout(function () { toast.remove(); }, 300);
    }, 3500);
}

// =============================================
// 1. NAVBAR — scroll effect (same as index)
// =============================================

window.addEventListener("scroll", function () {
    var navbar = document.getElementById("mainNav");
    if (!navbar) return;
    navbar.style.backgroundColor = window.scrollY > 50
        ? "rgba(3, 13, 28, 0.98)"
        : "rgba(3, 13, 28, 0.92)";
});

// =============================================
// 2. TAB SWITCHER
// =============================================

var tabLogin    = document.getElementById("tab-login");
var tabRegister = document.getElementById("tab-register");
var panelLogin  = document.getElementById("panel-login");
var panelReg    = document.getElementById("panel-register");

function activateTab(activeTab, activePanel, inactiveTab, inactivePanel) {
    activeTab.classList.add("active");
    activeTab.setAttribute("aria-selected", "true");
    inactiveTab.classList.remove("active");
    inactiveTab.setAttribute("aria-selected", "false");
    activePanel.classList.remove("hidden");
    inactivePanel.classList.add("hidden");
    document.title = activePanel.id === "panel-login"
        ? "Clarivo — Sign In"
        : "Clarivo — Create Account";
}

if (tabLogin && tabRegister) {
    tabLogin.addEventListener("click", function () {
        activateTab(tabLogin, panelLogin, tabRegister, panelReg);
    });

    tabRegister.addEventListener("click", function () {
        activateTab(tabRegister, panelReg, tabLogin, panelLogin);
    });
}

// Open the register tab if the URL has ?tab=register
(function () {
    var params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "register" && tabRegister) {
        activateTab(tabRegister, panelReg, tabLogin, panelLogin);
    }
})();

// =============================================
// 3. PASSWORD VISIBILITY TOGGLE
// =============================================

document.querySelectorAll(".toggle-pw").forEach(function (btn) {
    btn.addEventListener("click", function () {
        var targetId = btn.getAttribute("data-target");
        var input    = document.getElementById(targetId);
        if (!input) return;

        var isHidden = input.type === "password";
        input.type   = isHidden ? "text" : "password";

        var eyeShow = btn.querySelector(".eye-show");
        var eyeHide = btn.querySelector(".eye-hide");
        if (eyeShow) eyeShow.style.display = isHidden ? "none"  : "";
        if (eyeHide) eyeHide.style.display = isHidden ? ""      : "none";
    });
});

// =============================================
// 4. PASSWORD STRENGTH METER (register only)
// =============================================

var regPassword   = document.getElementById("regPassword");
var strengthFill  = document.getElementById("strengthFill");
var strengthLabel = document.getElementById("strengthLabel");

function scorePassword(pw) {
    var score = 0;
    if (pw.length >= 8)  score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
}

if (regPassword && strengthFill && strengthLabel) {
    regPassword.addEventListener("input", function () {
        var pw    = regPassword.value;
        var score = pw.length === 0 ? 0 : scorePassword(pw);
        var cls   = "";
        var lbl   = "";

        if (pw.length === 0) {
            cls = "";
            lbl = "";
        } else if (score <= 1) {
            cls = "weak";
            lbl = "Weak";
        } else if (score <= 2) {
            cls = "fair";
            lbl = "Fair";
        } else {
            cls = "strong";
            lbl = "Strong";
        }

        strengthFill.className  = "strength-fill " + cls;
        strengthLabel.className = "strength-label " + cls;
        strengthLabel.textContent = lbl;
    });
}

// =============================================
// 5. FORM VALIDATION HELPERS
// =============================================

function showError(fieldId, errorId, message) {
    var field = document.getElementById(fieldId);
    var error = document.getElementById(errorId);
    if (field)  field.classList.add("is-error");
    if (error)  error.textContent = message;
    return false;
}

function clearError(fieldId, errorId) {
    var field = document.getElementById(fieldId);
    var error = document.getElementById(errorId);
    if (field)  field.classList.remove("is-error");
    if (error)  error.textContent = "";
}

function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Clear error on input
["loginEmail","loginPassword","regFirstName","regLastName","regEmail","regPassword","regConfirm"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () {
        el.classList.remove("is-error");
        var errEl = document.getElementById(id + "Error");
        if (errEl) errEl.textContent = "";
    });
});

// =============================================
// 6. LOGIN FORM SUBMIT
// =============================================

// Demo-only authentication — matches the mobile app's demo account.
// This is a frontend-only university project; no backend/auth server is used.
var DEMO_EMAIL    = "demo@clarivo.com";
var DEMO_PASSWORD = "123456";

var loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var ok = true;

        clearError("loginEmail",    "loginEmailError");
        clearError("loginPassword", "loginPasswordError");

        var email = document.getElementById("loginEmail").value.trim();
        var pw    = document.getElementById("loginPassword").value;

        if (!email) {
            ok = showError("loginEmail", "loginEmailError", "Email is required.");
        } else if (!validateEmail(email)) {
            ok = showError("loginEmail", "loginEmailError", "Enter a valid email address.");
        }

        if (!pw) {
            ok = showError("loginPassword", "loginPasswordError", "Password is required.");
        }

        if (!ok) return;

        // Only the demo account may sign in — no other credentials are accepted.
        if (email.toLowerCase() !== DEMO_EMAIL || pw !== DEMO_PASSWORD) {
            var invalidMsg = "Invalid email or password. Please use the demo account credentials.";
            showError("loginEmail",    "loginEmailError",    invalidMsg);
            showError("loginPassword", "loginPasswordError", invalidMsg);
            showToast(invalidMsg, "error");
            return;
        }

        // Save login state to localStorage
        var user = {
            email: email,
            name: email.split("@")[0]
        };
        localStorage.setItem("clarivoUser", JSON.stringify(user));

        showToast("Signed in successfully.", "success");

        // Redirect to Home Page after short delay
        setTimeout(function () {
            window.location.href = "index.html";
        }, 1200);
    });
}

// =============================================
// 7. REGISTER FORM SUBMIT
// =============================================

var registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var ok = true;

        ["regFirstName","regLastName","regEmail","regPassword","regConfirm"].forEach(function (id) {
            clearError(id, id + "Error");
        });
        var errTerms = document.getElementById("agreeTermsError");
        if (errTerms) errTerms.textContent = "";

        var firstName = document.getElementById("regFirstName").value.trim();
        var lastName  = document.getElementById("regLastName").value.trim();
        var email     = document.getElementById("regEmail").value.trim();
        var pw        = document.getElementById("regPassword").value;
        var confirm   = document.getElementById("regConfirm").value;
        var agreed    = document.getElementById("agreeTerms").checked;

        if (!firstName) ok = showError("regFirstName", "regFirstNameError", "First name is required.");
        if (!lastName)  ok = showError("regLastName",  "regLastNameError",  "Last name is required.");

        if (!email) {
            ok = showError("regEmail", "regEmailError", "Email is required.");
        } else if (!validateEmail(email)) {
            ok = showError("regEmail", "regEmailError", "Enter a valid email address.");
        }

        if (!pw) {
            ok = showError("regPassword", "regPasswordError", "Password is required.");
        } else if (pw.length < 8) {
            ok = showError("regPassword", "regPasswordError", "Password must be at least 8 characters.");
        }

        if (!confirm) {
            ok = showError("regConfirm", "regConfirmError", "Please confirm your password.");
        } else if (pw !== confirm) {
            ok = showError("regConfirm", "regConfirmError", "Passwords do not match.");
        }

        if (!agreed) {
            ok = false;
            if (errTerms) errTerms.textContent = "You must agree to the terms to continue.";
        }

        if (!ok) return;

        // This is a demo-only project — registration does not create a new
        // valid login account. Only the demo account (demo@clarivo.com / 123456)
        // can sign in, matching the mobile app's demo authentication approach.
        showToast("Account created. Please sign in with the demo account.", "success");

        setTimeout(function () {
            if (tabLogin && tabRegister) {
                activateTab(tabLogin, panelLogin, tabRegister, panelReg);
            }
        }, 1200);
    });
}
