import UIKit

/// One system segmented surface and one sliding selection lens, rather than four glass buttons.
/// UIKit owns the Liquid Glass appearance and accessibility; a drag commits only when released.
final class SlidingToolNavigation: UISegmentedControl {
    static let titles = ["云笔记", "新测评", "错题本", "图库"]
    static let paths = ["/note", "/exam", "/mistake", "/picture"]
    var onCommit: ((Int) -> Void)?
    private var trackingTouch = false
    private var previousSelection = UISegmentedControl.noSegment

    init() {
        super.init(items: Self.titles)
        selectedSegmentIndex = UISegmentedControl.noSegment
        accessibilityIdentifier = "learning-navigation"
        setTitleTextAttributes([.font: UIFont.preferredFont(forTextStyle: .subheadline)], for: .normal)
        addTarget(self, action: #selector(accessibleSelection), for: .valueChanged)
        // No custom background, divider or selection images: preserve the system glass lens.
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    func sync(path: String) {
        let clean = path.split(separator: "?").first.map(String.init) ?? path
        selectedSegmentIndex = Self.paths.firstIndex { clean == $0 || clean.hasPrefix($0 + "/") } ?? UISegmentedControl.noSegment
    }
    private func select(at point: CGPoint) {
        guard bounds.width > 0 else { return }
        let index = min(numberOfSegments - 1, max(0, Int(floor(point.x / (bounds.width / CGFloat(numberOfSegments))))))
        if selectedSegmentIndex != index { selectedSegmentIndex = index }
    }
    override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
        previousSelection = selectedSegmentIndex; trackingTouch = true
        _ = super.beginTracking(touch, with: event)
        select(at: touch.location(in: self)); return true
    }
    override func continueTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
        _ = super.continueTracking(touch, with: event)
        select(at: touch.location(in: self)); return true
    }
    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        super.endTracking(touch, with: event)
        if let touch, bounds.insetBy(dx: -24, dy: -24).contains(touch.location(in: self)) {
            select(at: touch.location(in: self)); trackingTouch = false
            onCommit?(selectedSegmentIndex)
        } else { selectedSegmentIndex = previousSelection; trackingTouch = false }
    }
    override func cancelTracking(with event: UIEvent?) {
        super.cancelTracking(with: event)
        selectedSegmentIndex = previousSelection; trackingTouch = false
    }
    @objc private func accessibleSelection() {
        // VoiceOver / keyboard changes bypass touch tracking but must navigate too.
        if !trackingTouch, selectedSegmentIndex >= 0 { onCommit?(selectedSegmentIndex) }
    }
}

#if targetEnvironment(simulator)
/// Isolated UI-test host for the exact production control, without an account or official writes.
/// This code is excluded from the device IPA by the compiler.
final class NavigationTestController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        let navigation = SlidingToolNavigation(), result = UILabel()
        result.accessibilityIdentifier = "navigation-result"; result.text = "ready"
        navigation.onCommit = { index in result.text = SlidingToolNavigation.paths[index] }
        navigation.translatesAutoresizingMaskIntoConstraints = false; result.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(navigation); view.addSubview(result)
        NSLayoutConstraint.activate([
            navigation.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            navigation.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            navigation.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            navigation.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            result.centerXAnchor.constraint(equalTo: view.centerXAnchor), result.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
}
#endif
