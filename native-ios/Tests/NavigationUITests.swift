import XCTest

final class NavigationUITests: XCTestCase {
    func testUnifiedNavigationTapAndSlide() {
        let app = XCUIApplication()
        app.launchArguments = ["--navigation-ui-test"]
        app.launch()
        let bar = app.segmentedControls["learning-navigation"]
        XCTAssertTrue(bar.waitForExistence(timeout: 10))
        XCTAssertEqual(app.segmentedControls.count, 1)
        XCTAssertEqual(bar.buttons.count, 4)
        XCTAssertGreaterThanOrEqual(bar.frame.height, 44)
        let result = app.staticTexts["navigation-result"]
        bar.buttons["新测评"].tap()
        XCTAssertEqual(result.label, "/exam")
        bar.buttons["云笔记"].tap()
        XCTAssertEqual(result.label, "/note")
        let start = bar.coordinate(withNormalizedOffset: CGVector(dx: 0.125, dy: 0.5))
        let end = bar.coordinate(withNormalizedOffset: CGVector(dx: 0.875, dy: 0.5))
        start.press(forDuration: 0.1, thenDragTo: end)
        XCTAssertEqual(result.label, "/picture")
        end.press(forDuration: 0.1, thenDragTo: start)
        XCTAssertEqual(result.label, "/note")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Unified Liquid Glass after slide"; shot.lifetime = .keepAlways
        add(shot)
    }
}
