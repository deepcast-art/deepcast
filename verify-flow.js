import puppeteer from 'puppeteer';

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  const results = {
    step1: { success: false, message: '' },
    step2: { success: false, message: '' },
    step3: { success: false, message: '' },
    step4: { success: false, message: '' },
    consoleErrors: []
  };

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
    }
  });

  try {
    // Step 1: Open http://localhost:5174/
    console.log('Step 1: Opening http://localhost:5174/');
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2' });
    results.step1.success = true;
    results.step1.message = 'Successfully loaded homepage';
    console.log('✓ Homepage loaded');

    // Step 2: Click "Are you a filmmaker?" to reach login
    console.log('\nStep 2: Looking for "Are you a filmmaker?" button');
    
    // Wait for button to appear
    await page.waitForSelector('button, a', { timeout: 5000 });
    
    // Find button with text matching "Are you a filmmaker?"
    const filmmakerButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons.find(btn => /are you a filmmaker/i.test(btn.textContent));
    });
    
    const filmmakerButtonExists = await page.evaluate(btn => btn !== undefined, filmmakerButton);
    
    if (filmmakerButtonExists) {
      const buttonText = await page.evaluate(btn => btn?.textContent, filmmakerButton);
      console.log(`Found button with text: "${buttonText}"`);
      
      // Click and wait for either navigation or DOM changes
      await Promise.race([
        page.evaluate(btn => btn?.click(), filmmakerButton).then(() => 
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {})
        ),
        wait(2000)
      ]);
      
      // Wait a bit more for any client-side routing
      await wait(1000);
      
      results.step2.success = true;
      results.step2.message = `Clicked "${buttonText}" button and navigated`;
      console.log('✓ Clicked filmmaker button');
    } else {
      results.step2.success = false;
      results.step2.message = 'Could not find "Are you a filmmaker?" button';
      console.log('✗ Button not found');
    }

    // Step 3: Confirm login page shows only a Filmmaker signup button (no viewer option)
    console.log('\nStep 3: Checking login page for Filmmaker signup button only');
    await wait(1000);
    
    // Get all buttons on the page for debugging
    const allButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons.map(btn => btn.textContent?.trim()).filter(text => text);
    });
    console.log(`All buttons found: ${JSON.stringify(allButtons)}`);
    
    // Find filmmaker/creator signup button (more flexible matching)
    // Looking for button that says "Filmmaker" or similar (may not include "signup" in text)
    const filmmakerSignupButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        // Match "Filmmaker" or "Creator" button (with or without signup/join/register)
        return text.includes('filmmaker') || text.includes('creator');
      });
    });
    
    const filmmakerSignupExists = await page.evaluate(btn => btn !== undefined, filmmakerSignupButton);
    
    // Check for viewer signup button
    const viewerButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return (text.includes('viewer') || text.includes('audience') || text.includes('watch')) && 
               (text.includes('signup') || text.includes('sign up') || text.includes('join') || text.includes('register'));
      });
    });
    
    const viewerButtonExists = await page.evaluate(btn => btn !== undefined, viewerButton);
    
    if (filmmakerSignupExists && !viewerButtonExists) {
      const signupButtonText = await page.evaluate(btn => btn?.textContent, filmmakerSignupButton);
      results.step3.success = true;
      results.step3.message = `Login page shows only Filmmaker signup button: "${signupButtonText}". No viewer option found.`;
      console.log(`✓ Found Filmmaker signup button: "${signupButtonText}"`);
      console.log('✓ No viewer option found');
    } else if (!filmmakerSignupExists) {
      results.step3.success = false;
      results.step3.message = `No Filmmaker signup button found on login page. Available buttons: ${allButtons.join(', ')}`;
      console.log('✗ No Filmmaker signup button found');
    } else if (viewerButtonExists) {
      const viewerText = await page.evaluate(btn => btn?.textContent, viewerButton);
      results.step3.success = false;
      results.step3.message = `MISMATCH: Found viewer option "${viewerText}" but should only show Filmmaker signup`;
      console.log(`✗ MISMATCH: Found viewer option "${viewerText}"`);
    }

    // Step 4: Click Filmmaker signup and confirm the signup page
    console.log('\nStep 4: Clicking Filmmaker signup button');
    if (filmmakerSignupExists) {
      // Click and wait for either navigation or DOM changes
      await Promise.race([
        page.evaluate(btn => btn?.click(), filmmakerSignupButton).then(() => 
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {})
        ),
        wait(2000)
      ]);
      
      await wait(1000);
      
      // Check for creator/filmmaker signup headline
      const headline = await page.evaluateHandle(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
        return headings.find(h => /creator|filmmaker/i.test(h.textContent));
      });
      
      const headlineExists = await page.evaluate(h => h !== undefined, headline);
      
      if (headlineExists) {
        const headlineText = await page.evaluate(h => h?.textContent, headline);
        
        // Get all text content on the page to check for creator-specific copy
        const pageText = await page.evaluate(() => document.body.textContent);
        const hasCreatorCopy = /creator|filmmaker|upload|content|video|film/i.test(pageText);
        
        results.step4.success = true;
        results.step4.message = `Signup page shows headline: "${headlineText}". Page contains creator-specific copy: ${hasCreatorCopy}`;
        console.log(`✓ Found headline: "${headlineText}"`);
        console.log(`✓ Creator-specific copy present: ${hasCreatorCopy}`);
        
        // Extract some sample copy text
        const paragraphs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('p')).map(p => p.textContent);
        });
        const sampleCopy = paragraphs.slice(0, 3).join(' | ');
        if (sampleCopy) {
          results.step4.copyText = sampleCopy;
          console.log(`Sample copy: "${sampleCopy.substring(0, 150)}..."`);
        }
      } else {
        results.step4.success = false;
        results.step4.message = 'No creator/filmmaker signup headline found on signup page';
        console.log('✗ No creator/filmmaker headline found');
      }
    } else {
      results.step4.success = false;
      results.step4.message = 'Could not proceed - no Filmmaker signup button to click';
      console.log('✗ Could not proceed to step 4');
    }

  } catch (error) {
    console.error('Error during verification:', error.message);
    results.error = error.message;
  } finally {
    await browser.close();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Step 1 (Open homepage): ${results.step1.success ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  ${results.step1.message}`);
    console.log(`\nStep 2 (Click filmmaker button): ${results.step2.success ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  ${results.step2.message}`);
    console.log(`\nStep 3 (Check login page): ${results.step3.success ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  ${results.step3.message}`);
    console.log(`\nStep 4 (Check signup page): ${results.step4.success ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  ${results.step4.message}`);
    if (results.step4.copyText) {
      console.log(`  Copy text: "${results.step4.copyText}"`);
    }
    
    if (results.consoleErrors.length > 0) {
      console.log('\n⚠ CONSOLE ERRORS DETECTED:');
      results.consoleErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    } else {
      console.log('\n✓ No console errors detected');
    }
    
    console.log('='.repeat(60));
  }
})();
