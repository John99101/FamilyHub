---
paths:
  - "**/*.java"
  - "**/*.kt"
  - "**/pom.xml"
  - "**/build.gradle*"
---

# Java / Kotlin (JVM)

<!-- cct rule pack: /setup copies this into .claude/rules/, fills the specifics and narrows the paths. -->

## Project specifics
- JDK: {{JDK_VERSION}} · build tool: {{JVM_BUILD_TOOL}} (use the wrapper: `./mvnw` or `./gradlew`)
- Framework: {{JVM_FRAMEWORK}}

## Always
- Use the build wrapper, never a globally installed Maven or Gradle.
- Constructor injection only; no field injection. Keep fields `final`.
- Prefer immutable data: Java `record`s, Kotlin `data class` with `val`.
- Never return `null` from public methods where `Optional` (Java) or a nullable type (Kotlin) states intent better. Don't use `Optional` for fields or parameters.
- Close resources with try-with-resources (Java) or `use {}` (Kotlin).
- Catch specific exceptions. Never swallow them; log with context or rethrow wrapped.
- Database access goes through the existing repository layer. Use parameterised queries, never string-built SQL.
- Tests use JUnit 5 (and the project's assertion library). Name tests after behaviour: `returnsEmptyListWhenNoOrders()`.
- Keep framework annotations out of the domain layer where the architecture separates them.
