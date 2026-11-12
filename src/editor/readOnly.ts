import { Plugin } from "@milkdown/kit/prose/state";

export function createReadOnlyPlugin(isReadOnly: () => boolean): Plugin {
  return new Plugin({
    props: {
      editable: () => !isReadOnly(),
      attributes: () => ({ "aria-readonly": String(isReadOnly()) }),
    },
    // editable 只限制浏览器输入，命令和异步上传产生的事务也要拦截。
    filterTransaction: (tr) => !isReadOnly() || !tr.docChanged,
  });
}
