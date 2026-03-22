import Cocoa

class GazeDot: NSView {
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Outer glow
        let glowColor = NSColor(red: 0.86, green: 0.08, blue: 0.24, alpha: 0.25)
        ctx.setFillColor(glowColor.cgColor)
        ctx.fillEllipse(in: bounds)

        // Inner dot
        let inner = bounds.insetBy(dx: 10, dy: 10)
        let dotColor = NSColor(red: 0.86, green: 0.08, blue: 0.24, alpha: 0.75)
        ctx.setFillColor(dotColor.cgColor)
        ctx.fillEllipse(in: inner)

        // Core
        let core = bounds.insetBy(dx: 16, dy: 16)
        let coreColor = NSColor(red: 1, green: 0, blue: 0, alpha: 0.9)
        ctx.setFillColor(coreColor.cgColor)
        ctx.fillEllipse(in: core)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var dotView: GazeDot!
    var timer: Timer?
    let dotSize: CGFloat = 44

    func applicationDidFinishLaunching(_ notification: Notification) {
        let screen = NSScreen.main!.frame

        window = NSWindow(
            contentRect: screen,
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        window.level = .statusBar
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

        dotView = GazeDot(frame: NSRect(x: 0, y: 0, width: dotSize, height: dotSize))
        window.contentView?.addSubview(dotView)
        window.makeKeyAndOrderFront(nil)

        // Poll gaze file at 60fps
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            self?.updatePosition()
        }
        RunLoop.current.add(timer!, forMode: .common)
    }

    func updatePosition() {
        let path = "/tmp/lunatic-gaze.json"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let x = json["x"] as? Double,
              let y = json["y"] as? Double else { return }

        let visible = (json["visible"] as? Bool) ?? true

        let screen = NSScreen.main!.frame
        let half = dotSize / 2
        let screenX = x - half
        let screenY = screen.height - y - half

        DispatchQueue.main.async { [weak self] in
            self?.dotView.isHidden = !visible
            self?.dotView.frame.origin = CGPoint(x: screenX, y: screenY)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // No dock icon
app.run()
