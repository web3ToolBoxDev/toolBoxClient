'use strict';

class BehaviorSimulator {
  constructor(page) {
    this.page = page;
  }

  async humanMoveTo(x, y) {
    const startPos = await this.page.evaluate(() => ({ x: window.mouseX || 0, y: window.mouseY || 0 }));
    const startX = startPos.x || Math.random() * 800;
    const startY = startPos.y || Math.random() * 600;
    const steps = 20 + Math.floor(Math.random() * 30);
    const cx1 = startX + (x - startX) * 0.25 + (Math.random() - 0.5) * 100;
    const cy1 = startY + (y - startY) * 0.25 + (Math.random() - 0.5) * 100;
    const cx2 = startX + (x - startX) * 0.75 + (Math.random() - 0.5) * 100;
    const cy2 = startY + (y - startY) * 0.75 + (Math.random() - 0.5) * 100;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.pow(1 - t, 3) * startX + 3 * Math.pow(1 - t, 2) * t * cx1 + 3 * (1 - t) * Math.pow(t, 2) * cx2 + Math.pow(t, 3) * x;
      const py = Math.pow(1 - t, 3) * startY + 3 * Math.pow(1 - t, 2) * t * cy1 + 3 * (1 - t) * Math.pow(t, 2) * cy2 + Math.pow(t, 3) * y;
      await this.page.mouse.move(px, py);
      await this.page.waitForTimeout(10 + Math.random() * 20);
    }
  }

  async humanClick(x, y) {
    await this.humanMoveTo(x, y);
    await this.page.waitForTimeout(50 + Math.random() * 150);
    await this.page.mouse.down();
    await this.page.waitForTimeout(30 + Math.random() * 70);
    await this.page.mouse.up();
  }

  async humanType(text) {
    for (const char of text) {
      await this.page.keyboard.type(char, { delay: 50 + Math.random() * 150 });
      if (Math.random() < 0.1) await this.page.waitForTimeout(200 + Math.random() * 500);
    }
  }

  async humanScroll(direction = 'down', distance = 500) {
    const steps = 10 + Math.floor(Math.random() * 20);
    const stepSize = distance / steps;
    for (let i = 0; i < steps; i++) {
      const delta = stepSize + (Math.random() - 0.5) * stepSize * 0.5;
      await this.page.mouse.wheel({ deltaY: direction === 'down' ? delta : -delta });
      await this.page.waitForTimeout(50 + Math.random() * 100);
    }
  }

  async randomDelay(min = 500, max = 3000) {
    await this.page.waitForTimeout(min + Math.random() * (max - min));
  }

  async simulateReading() {
    const scrollCount = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < scrollCount; i++) {
      await this.humanScroll('down', 200 + Math.random() * 400);
      await this.randomDelay(1000, 4000);
    }
  }
}

module.exports = { BehaviorSimulator };
