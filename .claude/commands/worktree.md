---
description: Crea un git worktree aislado en .trees/<nombre> y ejecuta ahí el requerimiento indicado, sin tocar el código principal
argument-hint: <descripción del requerimiento a implementar>
---

Vas a implementar el siguiente requerimiento de forma **aislada**, en un git worktree separado del árbol de trabajo principal:

$ARGUMENTS

Sigue estos pasos, en orden:

1. **Determina un nombre** corto y descriptivo en kebab-case (solo minúsculas, números y guiones, ej. `fix-ghost-piece`, `add-hold-queue`) que resuma el requerimiento anterior. Ese nombre se usará como carpeta y como rama.

2. **Crea el worktree** ejecutando exactamente:
   ```
   git worktree add .trees/<nombre>
   ```
   Esto crea una nueva rama `<nombre>` basada en HEAD y la deja checked-out en `.trees/<nombre>`, sin modificar el árbol de trabajo principal. Si la carpeta o la rama ya existen, elige un nombre alternativo (agrega un sufijo) antes de crear el worktree.

3. **Entra al worktree** con la herramienta `EnterWorktree`, pasando `path: ".trees/<nombre>"`, para que el resto de esta sesión trabaje de forma aislada dentro de ese directorio. No uses `EnterWorktree` con `name` (crearía otro worktree en `.claude/worktrees/`, no en `.trees/`).

4. **Implementa el requerimiento** descrito arriba dentro de ese worktree: explora el código, haz los cambios necesarios y verifica que funcionan, siguiendo las convenciones de `CLAUDE.md` (arquitectura de `game.js`, constantes ajustables, etc.).

5. No hagas commit ni push salvo que el usuario lo pida explícitamente.

6. Al terminar, informa al usuario en qué carpeta y rama quedó el trabajo (`.trees/<nombre>`, rama `<nombre>`), y que puede pedirte salir del worktree (conservándolo o eliminándolo) cuando quiera integrar los cambios o descartarlos.

Nota: si la sesión ya está dentro de otro worktree, sal de él primero (o avisa al usuario) antes de crear uno nuevo — no se puede crear un worktree nuevo desde dentro de otro.
