# Service Status Web Portal

A production-ready, full-stack Service Status Web Portal designed with Node.js, Express, EJS, and SQLite. The portal allows administrators to manage servers, clients, services, and incidents, while public visitors can verify the health of their services in real-time.

Inspired by enterprise status dashboards (like status.hostinger.com), the portal incorporates dark/light theme toggling, 5-second AJAX polling refresh, automated email reminders, and modern security implementations (CSRF, reCAPTCHA v3, SQL Prepared Statements).

---

## Technical Stack & Features

*   **Backend & Server**: Node.js, Express, EJS Templates, `node-cron`
*   **Database**: SQLite (`sqlite3`) with full Foreign Key constraints and schema normalization
*   **UI/UX Framework**: Bootstrap 5, Font Awesome, and Vanilla CSS with native CSS variables for seamless theme toggling (stored in `localStorage`)
*   **Security Controls**:
    *   **Password Hashing**: Securely managed using `bcryptjs`
    *   **CSRF Protection**: Token check validation on all state-modifying requests (`POST`/`PUT`/`DELETE`)
    *   **Google reCAPTCHA v3**: Setup for Admin Login, Forgot Password, and Reset Password with a strict `0.7` approval score threshold. If keys are omitted in `.env`, the system defaults to a **Mock Bypass Mode** logging validation attempts, facilitating local review.
    *   **XSS Mitigation**: Strict EJS escape syntax and server-side inputs sanitization.
    *   **SQL Injection Protection**: Abstracted prepared statements across database operations.
*   **Notifications & Cron**:
    *   **Email Alert Logger**: Outgoing emails (e.g. incident creation alerts, temporary password resets, cron reminders) attempt SMTP transport. In addition, they write full HTML bodies to `data/sent_emails/` for inspection and local development audit.
    *   **Background Cron Job**: Runs every 5 minutes scanning upcoming maintenance windows starting in $\leq$ 1 hour, alerting affected service clients without sending duplicate emails (checked via `email_logs`).

---

## Installation & Setup

Ensure you have **Node.js** (v24.12.0+) and **NPM** installed.

1.  **Extract / Set Directory**:
    Navigate to the project root:
    ```bash
    cd C:\Users\HP\.gemini\antigravity\scratch\service-status-portal
    ```

2.  **Install Dependencies**:
    Dependencies are already installed. If running in a new space, execute:
    ```bash
    npm install
    ```

3.  **Setup Configuration (`.env`)**:
    An `.env` configuration file has been generated. To configure a real SMTP email client or live Google reCAPTCHA v3 credentials, edit the values inside:
    ```env
    PORT=3000
    SESSION_SECRET=a_very_long_secure_random_session_secret_12345!

    # Optional Google reCAPTCHA v3 keys (leave blank to run in mock auto-approve mode)
    RECAPTCHA_SITE_KEY=
    RECAPTCHA_SECRET_KEY=

    # Optional SMTP configuration (leave blank to only save emails to data/sent_emails/)
    SMTP_HOST=
    SMTP_PORT=587
    SMTP_USER=
    SMTP_PASS=
    SMTP_FROM=noreply@statusportal.local
    ```

4.  **Seed the Database**:
    Initialize the SQLite file database and populate it with sample servers, clients, services, and an admin profile:
    ```bash
    npm run seed
    ```

5.  **Run the Server**:
    Launch the Express application:
    ```bash
    npm start
    ```
    Open your browser and navigate to:
    *   **Public Status Page**: `http://localhost:3000`
    *   **Admin Panel Login**: `http://localhost:3000/login`

6.  **Admin Credentials**:
    *   **Username**: `admin`
    *   **Password**: `AdminPass123!`

---

## Database Normalization Schema

The SQLite schema is fully normalized inside `src/db.js` into 8 separate tables, ensuring data integrity:

```mermaid
erDiagram
    ADMINS {
        int id PK
        string username UNIQUE
        string password_hash
        string email
        string reset_token
        int reset_token_expires
    }
    SERVERS {
        int id PK
        string server_name
        string server_code UNIQUE
        string ip_address
        string location
        string status
        string description
    }
    CLIENTS {
        int id PK
        string client_name
        string company_name
        string contact_person
        string email
        string phone
        string status
    }
    SERVICES {
        string service_id PK
        int client_id FK
        int server_id FK
        int active_status
    }
    INCIDENTS {
        int id PK
        string title
        string type
        string severity
        string status
        datetime start_time
        datetime end_time
        string description
        string public_message
        string internal_notes
        string root_cause
        string expected_resolution
        string maintenance_window
        string created_by
    }
    INCIDENT_SERVERS {
        int incident_id PK, FK
        int server_id PK, FK
    }
    INCIDENT_SERVICES {
        int incident_id PK, FK
        string service_id PK, FK
        int is_affected
    }
    EMAIL_LOGS {
        int id PK
        int incident_id FK
        string service_id FK
        string email_type
        datetime sent_at
    }

    CLIENTS ||--o{ SERVICES : "owns"
    SERVERS ||--o{ SERVICES : "hosts"
    INCIDENTS ||--o{ INCIDENT_SERVERS : "maps"
    SERVERS ||--o{ INCIDENT_SERVERS : "linked"
    INCIDENTS ||--o{ INCIDENT_SERVICES : "targets"
    SERVICES ||--o{ INCIDENT_SERVICES : "linked"
    INCIDENTS ||--o{ EMAIL_LOGS : "logs"
    SERVICES ||--o{ EMAIL_LOGS : "receives"
```

### Table Relationships:
*   **Servers & Services**: $1 \rightarrow \text{Many}$ relationship. A single hosting server hosts multiple services, but each service is assigned to exactly one server.
*   **Clients & Services**: $1 \rightarrow \text{Many}$ relationship. A client owns multiple domains (services). To satisfy the requirement that "every client record represents one unique service", we map them directly via the Client Form, generating a client record and linking it to the globally unique service ID (domain name).
*   **Incidents, Servers, & Services**: $M \rightarrow N$ mapping. An incident can affect multiple servers (`incident_servers`). When servers are selected, the system pulls all hosted services (`incident_services`), allowing the administrator to check/uncheck individual domains to specify exact outage impacts.
*   **Email Logs**: Tracks sent emails to prevent sending duplicate notifications.

---

## Testing

Execute the automated assertion testing suite:
```bash
npm test
```
The suite verifies password comparison accuracy, domain validation regex, incident date rules, SQLite table operations, and verifies that email bodies generate correctly inside `data/sent_emails/`.
