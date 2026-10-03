import XCTest

final class NavigationUITests: XCTestCase {
    func testFullScreenWebGroupsAndSlidingDock() {
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 20))
        XCTAssertTrue(web.buttons["资源"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.navigationBars.count, 0, "No native navigation bar may divide the web UI")
        XCTAssertEqual(app.segmentedControls.count, 0, "Bottom tabs must live inside WKWebView")
        XCTAssertGreaterThan(web.frame.height, app.frame.height * 0.98)
        for label in ["资源", "测评", "问答", "我的"] {
            XCTAssertTrue(web.buttons[label].exists)
            XCTAssertGreaterThanOrEqual(web.buttons[label].frame.height, 44)
        }
        web.buttons["专栏"].tap()
        XCTAssertTrue(web.staticTexts["在线专栏"].exists)
        web.buttons["课程"].tap()
        XCTAssertTrue(web.buttons["进入学校选课"].exists)
        web.buttons["测评"].tap()
        XCTAssertTrue(web.buttons["作业"].exists)
        web.buttons["错题本"].tap()
        XCTAssertTrue(web.staticTexts["官方错题本"].exists)
        web.buttons["问答"].tap()
        XCTAssertTrue(web.staticTexts["随身答"].exists)
        web.buttons["资源"].tap()
        XCTAssertTrue(web.buttons["进入学校选课"].exists, "Remember the resource category across tab switches")
        let left = web.buttons["资源"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let right = web.buttons["我的"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        left.press(forDuration: 0.1, thenDragTo: right)
        XCTAssertTrue(web.buttons["账号与登录"].exists, "Sliding to My must show the account hub")
        web.buttons["深色"].tap()
        web.buttons["跟随系统"].tap()
        right.press(forDuration: 0.1, thenDragTo: left)
        XCTAssertTrue(web.buttons["进入学校选课"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Full-screen WKWebView resources and floating glass dock"; shot.lifetime = .keepAlways
        add(shot)
    }
}