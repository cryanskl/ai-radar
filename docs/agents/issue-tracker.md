# Issue tracker: GitHub

Specs and development tickets for this repository live as GitHub Issues in `cryanskl/ai-radar`.

Repository: https://github.com/cryanskl/ai-radar

Use the `gh` CLI for issue operations. When a skill says “publish to the issue tracker,” create a GitHub Issue in this repository.

## Conventions

- Create an issue with `gh issue create`.
- Read the complete body, comments and labels before acting on an existing issue.
- Apply and remove labels with `gh issue edit`.
- Close an issue only after its acceptance criteria have been satisfied.
- `/to-spec` publishes the build specification as a parent Issue.
- `/to-tickets` publishes one independently executable vertical-slice Issue per ticket.
- Apply `ready-for-agent` only when a ticket contains sufficient context and verifiable acceptance criteria for an agent to execute independently.

Infer the repository from the local `origin` remote when commands run inside this checkout.

## Blocking relationships

Prefer GitHub native Issue Dependencies. A ticket is ready to execute only when every blocking Issue is closed.

If native dependencies are unavailable, add this line near the top of the blocked ticket:

~~~text
Blocked by: #<issue>, #<issue>
~~~

Use “Blocked by: None” for a ticket that can start immediately.

## Pull requests as a triage surface

PRs as a request surface: no.

External Pull Requests are not automatically treated as feature requests. Issues and Pull Requests share one number space on GitHub, so resolve an ambiguous number by checking the Pull Request first and then the Issue.
