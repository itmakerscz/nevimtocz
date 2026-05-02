package main
import "syscall/js"

func main() {
    js.Global().Set("wasmSearch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
        return "Výsledky z WASM"
    }))
    select {}
}