# Cluster Verification Simplified Flow Diagram

## Cluster Verification Process

```mermaid
flowchart TD
    A[User C1 initiates login request] --> B[B-Client receives login request]
    B --> C{Check if user is new user}
    
    C -->|Is new user| D[Allow login directly]
    C -->|Not new user| E[Start cluster verification process]
    
    E --> F[Query other nodes in cluster]
    F --> G{Found valid batch?}
    
    G -->|Not found| H[Treat as new user, allow login]
    G -->|Found valid batch| I[Get batch_id and first record]
    
    I --> J[Send verification request to C1]
    J --> K[C1 queries local database]
    
    K --> L{Found same batch locally?}
    L -->|Not found| M[Verification failed, reject login]
    L -->|Found| N[Return local batch data]
    
    N --> O[B-Client performs data comparison]
    O --> P{Data completely matches?}
    
    P -->|No match| Q[Verification failed, data inconsistent]
    P -->|Complete match| R[Verification successful, allow login]
    
    R --> S[Send login_success message to C1]
    Q --> T[Send verification failure message]
    M --> T
    H --> U[Send new user login success message]
    D --> U
    
    %% Style definitions
    classDef startEnd fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef process fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef success fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef failure fill:#ffebee,stroke:#c62828,stroke-width:2px
    
    class A,S startEnd
    class B,E,F,I,J,K,N,O process
    class C,G,L,P decision
    class D,H,R,U success
    class M,Q,T failure
```

## Cluster Verification Sequence Diagram

```mermaid
sequenceDiagram
    participant C1 as C1 Client
    participant B as B-Client Service
    participant C2 as C2 Client

    Note over C1, C2: Cluster verification process starts

    C1->>B: 1. login_request
    Note over C1: User test1 initiates login request

    B->>B: 2. Start cluster verification process
    Note over B: Check if user is new user

    B->>C2: 3. cluster_verification_request
    Note over B: Query C2 for user's valid batch data

    C2->>C2: 4. Query local database for batch data
    Note over C2: Found user's valid batch data

    C2->>B: 5. cluster_verification_response
    Note over C2: Return batch data for verification

    B->>C1: 6. cluster_verification_request
    Note over B: Request C1 to verify same batch data

    C1->>C1: 7. Query local database for batch data
    Note over C1: Query local same batch data

    C1->>B: 8. cluster_verification_response
    Note over C1: Return local batch data for comparison

    B->>B: 9. Compare C1 and C2 record data
    Note over B: Detailed comparison of ID, user_id, URL, title fields

    B->>C1: 10. login_success
    Note over B: Cluster verification passed, user login successful

    Note over C1, C2: Cluster verification process completed
```

## Key Verification Fields

### Data Consistency Check
- **User Identifier**: `user_id` must match exactly
- **Activity Records**: `url`, `title`, `activity_type` must be consistent
- **Timestamp**: `created_at` must be the same
- **Record ID**: `id` must match
- **Description**: `description` must be consistent

### Security Verification Mechanism
- **Cluster Verification**: Ensure user is in the same cluster
- **Data Integrity**: Prevent data tampering
- **Timeliness Check**: Prevent replay attacks
- **Node Consistency**: Multi-node data synchronization verification
