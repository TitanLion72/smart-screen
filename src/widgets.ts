/** Small reusable controls: segmented picker, switch, tag editor. */

export interface SegOption {
  value: string;
  label: string;
}

export function buildSeg(
  host: HTMLElement,
  options: SegOption[],
  value: string,
  onPick: (value: string) => void,
): void {
  host.replaceChildren();
  for (const o of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seg-item";
    b.textContent = o.label;
    b.dataset.value = o.value;
    b.classList.toggle("active", o.value === value);
    b.addEventListener("click", () => {
      host.querySelectorAll(".seg-item").forEach((n) => n.classList.remove("active"));
      b.classList.add("active");
      onPick(o.value);
    });
    host.append(b);
  }
}

export interface SwitchHandle {
  set(value: boolean): void;
  get(): boolean;
}

export function bindSwitch(
  el: HTMLButtonElement,
  checked: boolean,
  onChange: (value: boolean) => void,
): SwitchHandle {
  let state = checked;
  const paint = (): void => {
    el.classList.toggle("on", state);
    el.setAttribute("aria-checked", state ? "true" : "false");
  };
  paint();
  el.addEventListener("click", () => {
    state = !state;
    paint();
    onChange(state);
  });
  return {
    set(v: boolean): void {
      state = v;
      paint();
    },
    get(): boolean {
      return state;
    },
  };
}

export interface TagHandle {
  set(items: string[]): void;
  get(): string[];
}

export function buildTagEditor(
  host: HTMLElement,
  items: string[],
  onChange: (items: string[]) => void,
): TagHandle {
  let current = items.slice();
  const row = document.createElement("div");
  row.className = "tag-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "ornek.exe + Enter";
  input.spellcheck = false;
  input.className = "tag-input";

  const paint = (): void => {
    row.querySelectorAll(".tag-pill").forEach((n) => n.remove());
    for (const item of current) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = item;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "tag-x";
      x.textContent = "×";
      x.addEventListener("click", () => {
        current = current.filter((v) => v !== item);
        onChange(current.slice());
        paint();
      });
      pill.append(x);
      row.insertBefore(pill, input);
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = input.value.trim().toLowerCase();
    if (value && !current.includes(value)) {
      current.push(value);
      onChange(current.slice());
      paint();
    }
    input.value = "";
  });

  row.append(input);
  host.replaceChildren(row);
  paint();

  return {
    set(next: string[]): void {
      current = next.slice();
      paint();
    },
    get(): string[] {
      return current.slice();
    },
  };
}