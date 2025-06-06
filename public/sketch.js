// Updated P5.js sketch to work with Express proxy server

// NO API KEY NEEDED HERE - it's safely stored in the server!

// Updated URL to call our local proxy server
const url = "http://localhost:3000/api/claude";

// Structure of how to communicate with Claude API via our proxy
let options = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // No authorization header needed -  server handles this!
  },
};

// Add this new variable to track selected artwork
let currentArtwork = null;

// Drawing canvas variables
let isDrawing = false;
let lastMouseX = 0;
let lastMouseY = 0;
let drawingStartX; // Left boundary of drawing area
let drawingEndX;   // Right boundary of drawing area (NEW)

// Collaborative drawing variables
let headInstructions = "";
let svgBodyCode = "";
let legInstructions = "";

// Drawing section boundaries
let headSectionTop;
let headSectionBottom;
let bodySectionTop;
let bodySectionBottom;
let legSectionTop;
let legSectionBottom;
let svgContainer; // HTML element to hold SVG

// NEW: Right panel for Claude's complete interpretation
let rightPanelStartX;
let claudeCompleteContainer;

// GUI elements
let randomArtworkButton;
let randomImage;
let artworkTitle;
let myOutput;
let clearButton;
let instructionsTitle;
let completedDrawingButton; 

// TOOLBOX VARIABLES
let toolboxButton;
let isToolboxOpen = false;
let toolboxContainer;
let currentTool = "brush"; 

// Tool controls
let brushButton, eraserButton;
let circleButton, rectButton, triangleButton;
let colorPicker;

// Separate sliders for different tools
let brushThicknessSlider, brushThicknessLabel;
let eraserThicknessSlider, eraserThicknessLabel;
let shapeThicknessSlider, shapeThicknessLabel;
let colorLabel;


let system_prompt = "You are a helpful assistant, reply in an informal tone.";

async function imageToBase64(imagePath) {
  return new Promise((resolve, reject) => {
    console.log("Trying to load and compress image:", imagePath);
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = function() {
      // Create canvas to resize image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Calculate new dimensions (max 600px on longest side - smaller than before)
      const maxSize = 600;  // Reduced from 800
      let { width, height } = img;
      
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }
      
      // Set canvas size and draw resized image
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to base64 with higher compression 50% quality 
      const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1]; // 0.5 = 50% quality
      
      console.log(`Compressed image: ${img.naturalWidth}x${img.naturalHeight} → ${width}x${height}`);
      console.log(`Base64 size: ~${(base64.length * 0.75 / 1024).toFixed(1)}KB`); // Approximate size
      resolve(base64);
    };
    
    img.onerror = function() {
      reject(new Error(`Failed to load image: ${imagePath}`));
    };
    
    img.src = imagePath;
  });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(220); // Set background once here instead

  // *** MOVE BOUNDARY DEFINITIONS TO TOP ***
  // Set up THREE-SECTION layout boundaries FIRST
  drawingStartX = width / 3;           // Drawing area starts at 1/3
  drawingEndX = (width / 3) * 2;       // Drawing area ends at 2/3  
  rightPanelStartX = (width / 3) * 2;  // Right panel starts at 2/3

  // Top half: Random artwork section
  randomArtworkButton = createButton("1 - Click to Generate Random Artwork");
  randomArtworkButton.position(15, 20);
  randomArtworkButton.mousePressed(generateRandomArtwork);
  randomArtworkButton.style('font-weight', 'bold'); 

  // Add clear button next to it
  clearButton = createButton("4 - Clear Canvas");
  clearButton.position(20, height - 70);
  clearButton.mousePressed(clearCanvas);
  clearButton.style('font-size', '16px');
  clearButton.style('font-weight', 'bold');

  // Setup the new toolbox system - NOW rightPanelStartX is defined!
  setupToolbox();
  
  // Existing artwork and instructions setup - CENTERED in left section
  randomImage = createImg("", "Random Artwork");
  
  // Center the image in the left third
  let leftSectionWidth = width / 3;
  let imageSize = 300;
  let centeredX = (leftSectionWidth - imageSize) / 2; // Center horizontally in left section
  let centeredY = 80; // A bit lower from top for better balance
  
  randomImage.position(centeredX, centeredY);
  randomImage.size(imageSize, imageSize);

  // NEW: Add artwork title underneath the image
  artworkTitle = createP("");
  artworkTitle.position(centeredX, centeredY + imageSize + 10); // 10px below image
  artworkTitle.size(imageSize, 30);
  artworkTitle.style('text-align', 'center');
  artworkTitle.style('font-weight', 'bold');
  artworkTitle.style('font-size', '14px');
  artworkTitle.style('color', '#333');
  artworkTitle.style('margin', '0');
   
  // Add instructions title
  instructionsTitle = createP("2 - Wait for instructions");
  instructionsTitle.position(20, height / 2 + 10);  
  instructionsTitle.style('font-weight','bold'); 
  instructionsTitle.style('color', 'black');

  //  "Completed Drawing" button - 3cm from bottom
  completedDrawingButton = createButton("3 - Completed Drawing!");
  completedDrawingButton.position(20, height - 113); // 3cm = ~113 pixels from bottom
  completedDrawingButton.mousePressed(showClaudeCompleteVision);
  completedDrawingButton.style('font-size', '16px');
  completedDrawingButton.style('font-weight', 'bold');
  completedDrawingButton.style('background-color', '#FF6B6B');
  completedDrawingButton.style('color', 'white');
  completedDrawingButton.style('padding', '10px 20px');
  completedDrawingButton.style('border-radius', '8px');
  completedDrawingButton.style('display', 'none'); // Hidden initially

  // Make the instruction box transparent and narrower
  let instructionWidth = (width / 3) - 60; // Narrower than before
  myOutput = createDiv("Claude's response will appear here.");
  myOutput.position(20, height / 2 + 60); 
  myOutput.size(instructionWidth, 180);  
  myOutput.style("overflow-y", "scroll");
  myOutput.style("color", "black");
  myOutput.style("background-color", "transparent"); // TRANSPARENT BACKGROUND
  myOutput.style("padding", "15px");
  myOutput.style("border-radius", "8px");
  myOutput.style("font-family", "Arial, sans-serif");
  myOutput.style("font-size", "13px");
  myOutput.style("line-height", "1.4");

  // Set up the three drawing sections (centered in the MIDDLE area)
  let drawingAreaHeight = height * 0.8;
  let startY = height * 0.1;
  let sectionHeight = drawingAreaHeight / 3;

  headSectionTop = startY;
  headSectionBottom = startY + sectionHeight;
  bodySectionTop = startY + sectionHeight;
  bodySectionBottom = startY + (2 * sectionHeight);
  legSectionTop = startY + (2 * sectionHeight);
  legSectionBottom = startY + drawingAreaHeight;

  // Create SVG container for Claude's body section - SMALLER SIZE
  let torsoWidth = 300;  // Reduced from 400 to 300
  let torsoHeight = 220; // Reduced from 300 to 220
  let middleAreaWidth = drawingEndX - drawingStartX;  // Width of middle section
  let centerX = drawingStartX + (middleAreaWidth - torsoWidth) / 2;
  let centerY = bodySectionTop + 25;

  svgContainer = createDiv('');
  svgContainer.position(centerX, centerY);
  svgContainer.size(torsoWidth, torsoHeight);
  svgContainer.style('text-align', 'center');

  // Create right panel - positioned HIGHER, not at bottom
  claudeCompleteContainer = createDiv('');
  claudeCompleteContainer.position(rightPanelStartX + 20, 100); // Higher: 100 instead of 60
  claudeCompleteContainer.size((width / 3) - 40, height - 200); // Shorter height
  claudeCompleteContainer.style('padding', '20px');
  claudeCompleteContainer.style('text-align', 'center');
  claudeCompleteContainer.html('<p style="color: #999; font-style: italic; text-align: center; margin-top: 100px;">Something special awaits... 🎨</p>');
}
function setupToolbox() {
  // Let's debug the positioning values first
  console.log("Canvas width:", width);
  console.log("rightPanelStartX:", rightPanelStartX);
  console.log("Toolbox button position will be:", rightPanelStartX + 10, 10);
  
  // Position toolbox in the FAR RIGHT section
  toolboxButton = createButton("🔧 Toolbox");
  
  // Try a simpler position first to test - let's put it at a fixed position
  toolboxButton.position(width - 200, 10); // 200px from right edge
  
  toolboxButton.mousePressed(toggleToolbox);
  toolboxButton.style('background-color', '#4CAF50');
  toolboxButton.style('color', 'white');
  toolboxButton.style('font-weight', 'bold');
  toolboxButton.style('padding', '5px 8px');
  toolboxButton.style('border-radius', '3px');
  toolboxButton.style('font-size', '12px');
  toolboxButton.style('z-index', '1000');
  toolboxButton.style('position', 'absolute'); // Make sure it's absolutely positioned
  
  console.log("Toolbox button created and positioned");

  // Create toolbox container - also use simpler positioning
  toolboxContainer = createDiv('');
  toolboxContainer.position(width - 200, 40); // 200px from right edge, below button
  toolboxContainer.size(180, 420);
  toolboxContainer.style('background-color', '#f9f9f9');
  toolboxContainer.style('padding', '10px');
  toolboxContainer.style('border-radius', '8px');
  toolboxContainer.style('border', '1px solid #ddd');
  toolboxContainer.style('display', 'none');
  toolboxContainer.style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');
  toolboxContainer.style('z-index', '1000');
  toolboxContainer.style('position', 'absolute');
  
  console.log("Toolbox container created");

  // === BRUSH TOOL SECTION ===
  brushButton = createButton("🖌️ Brush");
  brushButton.parent(toolboxContainer);
  brushButton.mousePressed(() => selectTool("brush"));
  brushButton.style('width', '100%');
  brushButton.style('margin-bottom', '4px');
  brushButton.style('padding', '4px');
  brushButton.style('font-size', '11px');

  // Brush thickness with live px display
  let brushLabel = createP("Thickness: 3px");
  brushLabel.parent(toolboxContainer);
  brushLabel.style('margin', '2px 0');
  brushLabel.style('font-size', '10px');
  brushLabel.style('color', '#666');

  brushThicknessSlider = createSlider(1, 15, 3);
  brushThicknessSlider.parent(toolboxContainer);
  brushThicknessSlider.style('width', '100%');
  brushThicknessSlider.style('margin-bottom', '8px');
  brushThicknessSlider.input(() => {
    brushLabel.html(`Thickness: ${brushThicknessSlider.value()}px`);
  });

  // === COLOR SECTION ===
  colorPicker = createColorPicker('#000000');
  colorPicker.parent(toolboxContainer);
  colorPicker.style('width', '100%');
  colorPicker.style('height', '25px');
  colorPicker.style('margin-bottom', '4px');

  // Add helpful tip
  let colorTip = createP(" Click arrows above for HEX codes");
  colorTip.parent(toolboxContainer);
  colorTip.style('margin', '0 0 8px 0');
  colorTip.style('font-size', '9px');
  colorTip.style('color', '#888');
  colorTip.style('text-align', 'center');
  colorTip.style('font-style', 'italic');

  // === ERASER SECTION ===
  eraserButton = createButton("🧽 Eraser");
  eraserButton.parent(toolboxContainer);
  eraserButton.mousePressed(() => selectTool("eraser"));
  eraserButton.style('width', '100%');
  eraserButton.style('margin-bottom', '4px');
  eraserButton.style('padding', '4px');
  eraserButton.style('font-size', '11px');

  // Eraser thickness with live px display
  let eraserLabel = createP("Thickness: 10px");
  eraserLabel.parent(toolboxContainer);
  eraserLabel.style('margin', '2px 0');
  eraserLabel.style('font-size', '10px');
  eraserLabel.style('color', '#666');

  eraserThicknessSlider = createSlider(5, 30, 10);
  eraserThicknessSlider.parent(toolboxContainer);
  eraserThicknessSlider.style('width', '100%');
  eraserThicknessSlider.style('margin-bottom', '8px');
  eraserThicknessSlider.input(() => {
    eraserLabel.html(`Thickness: ${eraserThicknessSlider.value()}px`);
  });

  // === SHAPES SECTION ===
  let shapesRow = createDiv('');
  shapesRow.parent(toolboxContainer);
  shapesRow.style('display', 'flex');
  shapesRow.style('gap', '3px');
  shapesRow.style('margin-bottom', '4px');

  circleButton = createButton("⭕");
  circleButton.parent(shapesRow);
  circleButton.mousePressed(() => selectTool("circle"));
  circleButton.style('flex', '1');
  circleButton.style('font-size', '12px');
  circleButton.style('padding', '4px 2px');

  rectButton = createButton("⬜");
  rectButton.parent(shapesRow);
  rectButton.mousePressed(() => selectTool("square"));
  rectButton.style('flex', '1');
  rectButton.style('font-size', '12px');
  rectButton.style('padding', '4px 2px');

  triangleButton = createButton("🔺");
  triangleButton.parent(shapesRow);
  triangleButton.mousePressed(() => selectTool("triangle"));
  triangleButton.style('flex', '1');
  triangleButton.style('font-size', '12px');
  triangleButton.style('padding', '4px 2px');

  // Shape size with live px display
  let shapeLabel = createP("Size: 50px");
  shapeLabel.parent(toolboxContainer);
  shapeLabel.style('margin', '2px 0');
  shapeLabel.style('font-size', '10px');
  shapeLabel.style('color', '#666');

  shapeThicknessSlider = createSlider(20, 100, 50);
  shapeThicknessSlider.parent(toolboxContainer);
  shapeThicknessSlider.style('width', '100%');
  shapeThicknessSlider.input(() => {
    shapeLabel.html(`Size: ${shapeThicknessSlider.value()}px`);
  });

  // Select brush tool by default
  selectTool("brush");
  
  console.log("Toolbox setup complete!");
}

function draw() {
  // Draw dividing lines for three sections
  stroke(0);
  strokeWeight(1);
  line(0, height / 2, width / 3, height / 2);  // Horizontal line in left section
  line(width / 3, 0, width / 3, height);       // Vertical line between left and middle
  line((width / 3) * 2, 0, (width / 3) * 2, height); // Vertical line between middle and right
  
  // Labels for sections - improved styling
  textAlign(LEFT);
  textFont('Arial', 16);

  // HEAD label (in middle section)
  fill(0);
  noStroke();
  text("HEAD", drawingStartX + 10, 30);

  // BODY label (in middle section)
  fill(0);
  noStroke();
  text("BODY (Claude)", drawingStartX + 10, bodySectionTop + 23);

  // LEGS label (in middle section)
  fill(0);
  noStroke();
  text("LEGS", drawingStartX + 10, legSectionTop + 28);

  // RIGHT PANEL label - only show when something is there
  // (We'll add this dynamically when Claude's vision is shown)
}

async function generateRandomArtwork() {
  // Array with your actual 22 artwork filenames
  let artworks = [
    "images/andy-warhol.marilyn-diptych.jpg",
    "images/arahmaiani.burning-country.jpg",
    "images/cildo-meireles.babel.jpg",
    "images/dorothea-tanning.eine-kleine-nachtmusik.jpg",
    "images/edgar-calel.the-echo-of-an-ancient-form-of-knowledge.jpg",
    "images/farah-al-qasimi.woman-in-leopard-print.jpg",
    "images/francesca-woodman.untitled,-from-eel-series,-venice,-italy.jpg",
    "images/henri-matisse.the-snail.jpg",
    "images/ibrahim-el-salahi.reborn-sounds-of-childhood-dreams-i.jpg",
    "images/joan-mitchell.iva.jpg",
    "images/josef-koudelka.on-22-and-23-august,-wenceslas-square-was-cleared-of-people,-august-1968.jpg",
    "images/marcel-duchamp.fountain.jpg",
    "images/maría-magdalena-campos-pons,-neil-leonard.matanzas-sound-map.jpg",
    "images/mark-rothko.black-on-maroon.jpg",
    "images/meschac-gaba.art-and-religion-room-from-museum-of-contemporary-african-art.jpg",
    "images/ming-wong.life-of-imitation.jpg",
    "images/monster-chetwynd.a-tax-haven-run-by-women.jpg",
    "images/nalini-malani.in-search-of-vanished-blood.jpg",
    "images/outi-pieski.spell-on-you!.jpg",
    "images/pacita-abad.european-mask.jpg",
    "images/pipilotti-rist.lungenflügel.jpg",
    "images/salvador-dalí.lobster-telephone.jpg"
  ];

  // Select random artwork
  let randomIndex = Math.floor(Math.random() * artworks.length);
  let randomImageUrl = artworks[randomIndex];
  randomImage.attribute("src", randomImageUrl);
  currentArtwork = randomImageUrl;

  let filename = randomImageUrl.replace("images/", "").replace(".jpg", "");
  let title = filename
    .split(/[-.]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  artworkTitle.html(title);
  
  console.log("Selected artwork:", currentArtwork);
  
  // Show loading message in chat
  myOutput.html("Analyzing artwork and generating character instructions...");
  
  // Automatically get character instructions
  await getCharacterInstructions();
}
async function getCharacterInstructions() {
  try {
    console.log("Starting to get character instructions for:", currentArtwork);
    
    // Convert selected artwork to base64
    const imageBase64 = await imageToBase64(currentArtwork);
    console.log("Successfully converted image to base64");
    
    // UPDATED PROMPT - Now asks for character features like eyes, smile, etc.
    const requestBody = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are creating a collaborative drawing exercise. The person will have LIMITED TOOLS:
- Basic brush (1-15px thickness)
- Eraser (5-30px thickness)  
- Color picker (can select ANY color!)
- 3 simple shapes: Circle, Square, Triangle (20-100px size)

Your job: Create REALISTIC character instructions that work with these basic tools and will result in something comparable to your own SVG creation.

IMPORTANT: COLOR IS KEY! The person has a color picker, so be SPECIFIC about colors from the original artwork. Don't just say "use the color picker" - tell them exactly which colors to use and where!

Based on this artwork, provide:

1. HEAD_INSTRUCTIONS: Include specific CHARACTER FEATURES WITH SPECIFIC COLORS:
   - Head shape (circle, oval, etc.) - specify skin tone/color from artwork
   - Eyes (circles, dots, lines) - specify eye colors from artwork  
   - Nose (small line, dot, or triangle) - specify color
   - Mouth/smile (curved line, arc) - specify lip color or tone
   - Hair or head details - specify hair colors from artwork
   - Any other facial features inspired by the artwork - with specific colors!
   
   Example: "Draw a large circle for the head using a warm peach color (#FFDBAC). Add two small black circles for eyes. Draw a red curved line for a smiling mouth..."

2. SVG_BODY: A body section SVG (300px x 220px) using the SAME SPECIFIC COLORS you mentioned in instructions.

3. LEG_INSTRUCTIONS: Basic geometric legs with SPECIFIC COLORS that match the artwork's palette.

Keep it FAIR - if you ask them to use specific colors, use those EXACT same colors in your SVG too. 

COLOR EMPHASIS: The character should capture the COLOR MOOD and PALETTE of the original artwork. Be specific with color codes when possible (like #FF5733 for orange) so they know exactly what to select with the color picker.

The goal is to create a recognizable character that feels connected to the original artwork through COLOR CHOICES!

Format EXACTLY like this:
HEAD_INSTRUCTIONS:
[realistic character instructions with SPECIFIC COLORS and facial features]

SVG_BODY:
<svg width="300" height="220" xmlns="http://www.w3.org/2000/svg">
[simple SVG using the SAME specific colors mentioned in instructions]
</svg>

LEG_INSTRUCTIONS:
[basic shape-based leg instructions with SPECIFIC COLORS]

Make the character come alive through COLOR and personality, directly inspired by the artwork's palette!`
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64
              }
            }
          ]
        }
      ]
    };

    console.log("Sending request to Claude API...");

    // Make the API request
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody)
    });

    console.log("API Response status:", response.status);
    console.log("API Response headers:", response.headers);

    // Check if response is ok
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    // Get the response text first to see what we're actually getting
    const responseText = await response.text();
    console.log("Raw API response:", responseText.substring(0, 200) + "...");

    // Try to parse as JSON
    const data = JSON.parse(responseText);
    
    if (data.content && data.content[0] && data.content[0].text) {
      const fullResponse = data.content[0].text;
      
      // Parse the structured response
      const headStart = fullResponse.indexOf("HEAD_INSTRUCTIONS:");
      const svgStart = fullResponse.indexOf("SVG_BODY:");
      const legStart = fullResponse.indexOf("LEG_INSTRUCTIONS:");
      
      if (headStart !== -1 && svgStart !== -1 && legStart !== -1) {
        // Extract each section
        headInstructions = fullResponse.substring(headStart + "HEAD_INSTRUCTIONS:".length, svgStart).trim();
        svgBodyCode = fullResponse.substring(svgStart + "SVG_BODY:".length, legStart).trim();
        legInstructions = fullResponse.substring(legStart + "LEG_INSTRUCTIONS:".length).trim();
        
        console.log("Head Instructions:", headInstructions);
        console.log("SVG Body Code:", svgBodyCode);
        console.log("Leg Instructions:", legInstructions);
        
        // Display the parsed content in a horizontal layout with better text flow
        myOutput.html(`
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; width: 100%;">
            <div style="min-width: 200px;">
              <h4 style="margin: 0 0 10px 0; color: #333; font-size: 15px; font-weight: bold;">HEAD & FACE:</h4>
              <div style="font-size: 13px; line-height: 1.5;">${headInstructions}</div>
            </div>
            <div style="min-width: 200px;">
              <h4 style="margin: 0 0 10px 0; color: #333; font-size: 15px; font-weight: bold;">LEGS:</h4>
              <div style="font-size: 13px; line-height: 1.5;">${legInstructions}</div>
            </div>
          </div>
        `);

        // Display Claude's SVG in the body section
        if (svgBodyCode.includes('<svg')) {
          svgContainer.html(svgBodyCode);
          console.log("SVG displayed successfully!");
        } else {
          svgContainer.html('<p style="color: red;">SVG not found</p>');
          console.log("SVG code not detected:", svgBodyCode);
        }

        // NEW: Show the "Completed Drawing" button now that instructions are ready
        completedDrawingButton.style('display', 'block');
      } else {
        // Fallback if parsing fails
        myOutput.html(fullResponse);
      }
    } else if (data.error) {
      myOutput.html("API Error: " + JSON.stringify(data.error));
    } else {
      myOutput.html("Unexpected response format: " + JSON.stringify(data));
    }
    
  } catch (error) {
    console.error("Detailed error:", error);
    console.error("Error stack:", error.stack);
    myOutput.html("Error: " + error.message + "<br>Check console for details.");
  }
}

function mousePressed() {
  // ONLY handle mouse events in the MIDDLE drawing section
  // Ignore all other areas to let HTML elements work normally
  if (mouseX >= drawingStartX && mouseX <= drawingEndX) {
    console.log("Mouse in drawing area - handling drawing logic");
    isDrawing = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    
    // Draw shapes immediately on click (ONLY in middle drawing area)
    if (currentTool === "circle" || currentTool === "square" || currentTool === "triangle") {
      console.log("Drawing shape:", currentTool);
      drawShape();
      isDrawing = false; // Don't continue dragging after placing a shape
    }
  }
  // For all other areas (including toolbox), do NOTHING
  // This lets HTML elements handle their own click events
}

function mouseDragged() {
  // Only allow drawing in the MIDDLE section (between 1/3 and 2/3)
  if (isDrawing && mouseX >= drawingStartX && mouseX <= drawingEndX) {
    if (currentTool === "brush") {
      let thickness = brushThicknessSlider.value();
      let selectedcolor = colorPicker.value();
      stroke(selectedcolor);
      strokeWeight(thickness);
      line(lastMouseX, lastMouseY, mouseX, mouseY);
    } else if (currentTool === "eraser") {
      let thickness = eraserThicknessSlider.value();
      stroke(220); // Background color
      strokeWeight(thickness);
      line(lastMouseX, lastMouseY, mouseX, mouseY);
    }
    
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}

function drawShape() {
  let size = shapeThicknessSlider.value();
  let selectedcolor = colorPicker.value();
  
  console.log("Drawing shape:", currentTool, "at", mouseX, mouseY, "size:", size, "color:", color);
  
  fill(selectedcolor);
  stroke(selectedcolor);
  strokeWeight(2);
  
  if (currentTool === "circle") {
    console.log("Drawing circle!");
    ellipse(mouseX, mouseY, size, size);
  } else if (currentTool === "square") {
    console.log("Drawing square!");
    rectMode(CENTER);
    rect(mouseX, mouseY, size, size);
  } else if (currentTool === "triangle") {
    console.log("Drawing triangle!");
    let halfSize = size / 2;
    triangle(
      mouseX, mouseY - halfSize,
      mouseX - halfSize, mouseY + halfSize,
      mouseX + halfSize, mouseY + halfSize
    );
  }
}

function mouseReleased() {
  isDrawing = false;
}

function clearCanvas() {
  // Clear the drawing canvas (redraw background)
  background(220);
  
  // Clear the SVG container
  svgContainer.html('');
  
  // Clear the instructions
  myOutput.html("Generate an artwork to start collaborating!");
  
  // NEW: Reset the right panel to secret state - BOTTOM ALIGNED
  claudeCompleteContainer.html('<p style="color: #999; font-style: italic; text-align: center;">Something special awaits... 🎨</p>');
  
  // Reset stored data
  headInstructions = "";
  svgBodyCode = "";
  legInstructions = "";
  currentArtwork = null;
  artworkTitle.html("");
  
  console.log("Canvas cleared - ready for new artwork!");
  
  // Hide the completed drawing button when canvas is cleared
  completedDrawingButton.style('display', 'none');
}

function toggleToolbox() {
  isToolboxOpen = !isToolboxOpen;
  
  if (isToolboxOpen) {
    toolboxContainer.style('display', 'block');
    toolboxButton.html("❌ Close");
    toolboxButton.style('background-color', '#ff6b6b');
  } else {
    toolboxContainer.style('display', 'none');
    toolboxButton.html("🔧 Toolbox");
    toolboxButton.style('background-color', '#4CAF50');
  }
}

function selectTool(tool) {
  currentTool = tool;
  
  // Reset all button styles
  brushButton.style('background-color', '#f0f0f0');
  brushButton.style('color', 'black');
  eraserButton.style('background-color', '#f0f0f0');
  eraserButton.style('color', 'black');
  circleButton.style('background-color', '#f0f0f0');
  rectButton.style('background-color', '#f0f0f0');
  triangleButton.style('background-color', '#f0f0f0');
  
  // Highlight selected tool
  if (tool === "brush") {
    brushButton.style('background-color', '#4CAF50');
    brushButton.style('color', 'white');
  } else if (tool === "eraser") {
    eraserButton.style('background-color', '#ff6b6b');
    eraserButton.style('color', 'white');
  } else if (tool === "circle") {
    circleButton.style('background-color', '#4CAF50');
  } else if (tool === "square") {
    rectButton.style('background-color', '#4CAF50');
  } else if (tool === "triangle") {
    triangleButton.style('background-color', '#4CAF50');
  }
  
  console.log("Selected tool:", tool);
}
async function showClaudeCompleteVision() {
  console.log("User clicked Completed Drawing - getting Claude's complete vision");
  
  if (!currentArtwork) {
    claudeCompleteContainer.html('<h3>Claude\'s Complete Vision</h3><p style="color: red;">No artwork selected! Please generate an artwork first.</p>');
    return;
  }
  
  if (!headInstructions || !legInstructions) {
    claudeCompleteContainer.html('<h3>Claude\'s Complete Vision</h3><p style="color: red;">No instructions found! Please generate an artwork first.</p>');
    return;
  }
  
  // Show loading message in right panel - BLACK TEXT
  claudeCompleteContainer.html('<h3 style="color: black;">Claude\'s Complete Vision</h3><p style="color: black;">🎨 Following my own instructions...</p>');
  
  try {
    console.log("Getting Claude's complete vision for:", currentArtwork);
    
    // Convert selected artwork to base64 (reuse the same image)
    const imageBase64 = await imageToBase64(currentArtwork);
    console.log("Successfully converted image to base64 for complete vision");
    
    // FIXED PROMPT - Much clearer about the creative task
    const requestBody = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `CREATIVE TASK: Create an SVG character drawing, don't describe the image.

You previously gave these instructions for a collaborative drawing exercise:

HEAD INSTRUCTIONS: ${headInstructions}

LEG INSTRUCTIONS: ${legInstructions}

BODY SVG: ${svgBodyCode}

TASK: Create a complete character SVG by following your own instructions exactly.

RULES:
1. This is a CREATIVE task - you must DRAW/CREATE, not describe
2. Follow your HEAD INSTRUCTIONS literally (if you said "draw a circle for head", draw a circle)
3. Follow your LEG INSTRUCTIONS literally  
4. Use your existing BODY design from above
5. Combine all three parts into one complete 500px x 700px SVG
6. Use the same specific colors you mentioned in your instructions

OUTPUT REQUIREMENTS:
- Respond with ONLY SVG code
- Start with <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
- End with </svg>
- NO text before or after the SVG
- NO descriptions or explanations
- This is pure SVG creation, not image analysis

CREATE the character now:`
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64
              }
            }
          ]
        }
      ]
    };

    console.log("Sending complete vision request to Claude API...");

    // Make the API request
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody)
    });

    console.log("Complete vision API Response status:", response.status);

    // Check if response is ok
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    // Get the response text first
    const responseText = await response.text();
    console.log("Raw complete vision response:", responseText.substring(0, 200) + "...");

    // Try to parse as JSON
    const data = JSON.parse(responseText);
    
    if (data.content && data.content[0] && data.content[0].text) {
      const completeSVG = data.content[0].text.trim();
      
      console.log("Complete SVG received:", completeSVG);
      
      // More flexible SVG detection - sometimes Claude adds text before/after
      let svgCode = completeSVG;
      
      // Extract SVG if it's embedded in text
      const svgStartIndex = completeSVG.indexOf('<svg');
      const svgEndIndex = completeSVG.lastIndexOf('</svg>') + 6;
      
      if (svgStartIndex !== -1 && svgEndIndex !== -1) {
        svgCode = completeSVG.substring(svgStartIndex, svgEndIndex);
        console.log("Extracted SVG code:", svgCode.substring(0, 100) + "...");
      }
      
      // Display Claude's complete vision
      if (svgCode.includes('<svg')) {
        claudeCompleteContainer.html(`
          <h3 style="color: #4CAF50; margin-bottom: 15px;">Claude's Complete Vision</h3>
          <p style="margin-bottom: 10px; font-size: 12px; color: #666; font-style: italic;">
            Following my own instructions exactly as given to you
          </p>
          ${svgCode}
          <p style="margin-top: 10px; font-size: 12px; color: #666;">
            Compare this with your collaborative creation!
          </p>
        `);
        console.log("Complete vision SVG displayed successfully!");
      } else {
        claudeCompleteContainer.html(`
          <h3 style="color: black;">Claude's Complete Vision</h3>
          <p style="color: red;">Claude provided description instead of SVG code</p>
          <details>
            <summary>Claude's response (click to expand)</summary>
            <pre style="font-size: 10px; max-height: 200px; overflow-y: scroll; background: #f5f5f5; padding: 10px; border-radius: 4px;">${completeSVG}</pre>
          </details>
          <p style="font-size: 12px; color: #666; margin-top: 10px;">
            Try clicking "Completed Drawing!" again - sometimes Claude needs a second attempt to create the SVG.
          </p>
        `);
      }
    } else if (data.error) {
      claudeCompleteContainer.html(`
        <h3 style="color: black;">Claude's Complete Vision</h3>
        <p style="color: red;">API Error: ${JSON.stringify(data.error)}</p>
      `);
    } else {
      claudeCompleteContainer.html(`
        <h3 style="color: black;">Claude's Complete Vision</h3>
        <p style="color: red;">Unexpected response format</p>
        <details>
          <summary>Response data</summary>
          <pre style="font-size: 10px;">${JSON.stringify(data)}</pre>
        </details>
      `);
    }
    
  } catch (error) {
    console.error("Complete vision error:", error);
    claudeCompleteContainer.html(`
      <h3 style="color: black;">Claude's Complete Vision</h3>
      <p style="color: red;">Error: ${error.message}</p>
      <p style="font-size: 12px;">Check console for details.</p>
    `);
  }
}

// Allow HTML elements to receive clicks normally
document.addEventListener('click', function(e) {
  e.stopPropagation();
}, true);