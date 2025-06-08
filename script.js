$(document).ready(function() {
    // Debounce function
    function debounce(func, wait = 500) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, wait);
        };
    }

    function escapeHTML(text) {
    return text.replace(/&/g, '&amp;')  // First, escape ampersands
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#39;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
    }

    function getCharacterLimit() {
        let limit = parseInt($('#charLimit').val(), 10);
        if (isNaN(limit) || limit <= 0) {
            limit = 500;
        }
        return limit;
    }

    function splitText(text) {
        const charLimit = getCharacterLimit();
        let chunks = [];

        // Split the text at manual split points first
        const manualChunks = text.split('===');
        manualChunks.forEach(manualChunk => {
            manualChunk = manualChunk.trim();
            while (manualChunk.length) {
                if (manualChunk.length <= charLimit) {
                    chunks.push(manualChunk);
                    break;
                }

                let chunk;
                let sliceEnd = charLimit;
                let lastPeriod = manualChunk.lastIndexOf('.', sliceEnd);
                let lastSpace = manualChunk.lastIndexOf(' ', sliceEnd);

                if (lastPeriod > charLimit - 100) {
                    sliceEnd = lastPeriod + 1;
                } else if (lastSpace !== -1) {
                    sliceEnd = lastSpace;
                }

                chunk = manualChunk.slice(0, sliceEnd);
                manualChunk = manualChunk.slice(sliceEnd).trim();

                chunks.push(chunk);
            }
        });

        return chunks;
    }

    function formatChunk(chunk) {
        // First, create a working copy of the chunk
        let workingChunk = chunk;
        
        // Normalize line breaks in the input to make processing consistent
        // Convert all line endings to '\n' for consistent processing
        workingChunk = workingChunk.replace(/\r\n|\r/g, '\n');
        
        // Split the text by newlines and process each line separately
        const lines = workingChunk.split('\n');
        const processedLines = [];
        
        for (let line of lines) {
            // Handle empty lines
            if (!line.trim()) {
                processedLines.push('');
                continue;
            }
            
            // Process the line
            let processedLine = processLine(line);
            processedLines.push(processedLine);
        }
        
        // Join the lines back with <br> tags
        return processedLines.join('<br>');
    }
    
    // Helper function to process a single line of text
    function processLine(line) {
        // Array to hold text parts
        const parts = [];
        let lastIndex = 0;
        
        // Track special regions to avoid processing twice
        let processedRegions = [];
        
        // First, identify URLs - we need to mark them to avoid conflicts with mentions inside URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let match;
        
        while ((match = urlRegex.exec(line)) !== null) {
            const url = match[0];
            const start = match.index;
            const end = start + url.length;
            
            processedRegions.push({
                start: start,
                end: end,
                type: 'url',
                content: url,
                html: `<a href="${url}" target="_blank">${url}</a>`
            });
        }
        
        // Find all @username@domain mentions that are NOT inside URLs
        const fullMentionRegex = /@(\w+)@([\w.-]+\.[a-z]{2,})/g;
        
        while ((match = fullMentionRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            
            // Check if this mention is inside a URL
            const isInsideProcessedRegion = processedRegions.some(
                region => start >= region.start && end <= region.end
            );
            
            if (!isInsideProcessedRegion) {
                processedRegions.push({
                    start: start,
                    end: end,
                    type: 'fullMention',
                    username: match[1],
                    domain: match[2],
                    content: match[0],
                    html: `<a href="https://${match[2]}/@${match[1]}" target="_blank">${match[0]}</a>`
                });
            }
        }
        
        // Find all simple @username mentions that are NOT inside URLs or full mentions
        const simpleMentionRegex = /@(\w+)(?!@)/g;
        
        while ((match = simpleMentionRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            
            // Check if this mention is inside another processed region
            const isInsideProcessedRegion = processedRegions.some(
                region => start >= region.start && end <= region.end
            );
            
            if (!isInsideProcessedRegion) {
                processedRegions.push({
                    start: start,
                    end: end,
                    type: 'simpleMention',
                    username: match[1],
                    content: match[0],
                    html: `<a href="https://mastodon.social/@${match[1]}" target="_blank">${match[0]}</a>`
                });
            }
        }
        
        // Find all hashtags that are NOT inside URLs
        const hashtagRegex = /#(\w+)/g;
        
        while ((match = hashtagRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            
            // Check if this hashtag is inside a URL
            const isInsideProcessedRegion = processedRegions.some(
                region => start >= region.start && end <= region.end
            );
            
            if (!isInsideProcessedRegion) {
                processedRegions.push({
                    start: start,
                    end: end,
                    type: 'hashtag',
                    tag: match[1],
                    content: match[0],
                    html: `<a href="https://mastodon.social/tags/${match[1]}" target="_blank">${match[0]}</a>`
                });
            }
        }
        
        // Sort all processed regions by start position
        processedRegions.sort((a, b) => a.start - b.start);
        
        // Rebuild the string with all replacements
        lastIndex = 0;
        for (const region of processedRegions) {
            // Add text before this region
            parts.push(line.substring(lastIndex, region.start));
            
            // Add the formatted HTML for this region
            parts.push(region.html);
            
            lastIndex = region.end;
        }
        
        // Add remaining text
        parts.push(line.substring(lastIndex));
        
        // Join all parts back together
        return parts.join('');
    }

    $('#inputText').on('input', debounce(function() {
        const text = $(this).val();
        const chunks = splitText(text) || [];
        const totalPosts = chunks.length;
        const paginationEnabled = $('#paginationCheckbox').prop('checked');

        $('#previewArea').empty();
        chunks.forEach((chunk, index) => {
            const charCount = chunk.length;
            const formattedChunk = formatChunk(chunk);
            
            let paginationText = "";
            if (paginationEnabled) {
                paginationText = `\n${index + 1}/${totalPosts}`;
            }

            $('#previewArea').append(`
                <div class="post-container">
                    <div class="alert alert-secondary">
                        <button class="btn btn-secondary btn-copy" data-text="${escapeHTML(chunk + paginationText)}">Copy</button>
                        <span class="char-count">${charCount} chars</span>
                        ${formattedChunk}
                        ${paginationText ? `<br><span class="post-number">${paginationText}</span>` : ''}
                    </div>
                </div>
            `);
        });
    }));

    $('#applyLimit').on('click', function() {
        // Trigger the input event to refresh the preview
        $('#inputText').trigger('input');
    });

    $(document).on('click', '.btn-copy', function() {
        const textToCopy = $(this).data('text');
        const textarea = $('<textarea>');
        textarea.text(textToCopy);
        $('body').append(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    
        // Change the button text to "Copied"
        $(this).text('Copied');
        // Reset button text after 2 seconds
        setTimeout(() => {
            $(this).text('Copy');
        }, 2000);

        // Add the copied class to the button to change its color
        $(this).addClass('copied');

        // Add the copied-post class to the parent post-container to change its background
        $(this).closest('.post-container').addClass('copied-post');
    });

    // Mastodon Integration
    let mastodonConfig = {
        server: '',
        clientId: '',
        clientSecret: '',
        accessToken: '',
        isLoggedIn: false
    };

    // Load saved config from localStorage
    function loadMastodonConfig() {
        const saved = localStorage.getItem('mastodonConfig');
        if (saved) {
            mastodonConfig = { ...mastodonConfig, ...JSON.parse(saved) };
            if (mastodonConfig.accessToken) {
                mastodonConfig.isLoggedIn = true;
                updateMastodonUI();
            }
        }
    }

    // Save config to localStorage
    function saveMastodonConfig() {
        localStorage.setItem('mastodonConfig', JSON.stringify(mastodonConfig));
    }

    // Update UI based on login status
    function updateMastodonUI() {
        if (mastodonConfig.isLoggedIn) {
            $('#mastodonLogin').hide();
            $('#mastodonLogout').show();
            $('#mastodonStatus').text('Logged in to ' + mastodonConfig.server).addClass('logged-in');
            $('.mastodon-posting').show();
        } else {
            $('#mastodonLogin').show();
            $('#mastodonLogout').hide();
            $('#mastodonStatus').text('Not logged in').removeClass('logged-in');
            $('.mastodon-posting').hide();
        }
    }

    // Register app with Mastodon instance
    async function registerMastodonApp(server) {
        try {
            const response = await fetch(`${server}/api/v1/apps`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_name: 'Mastothread',
                    redirect_uris: window.location.origin + window.location.pathname,
                    scopes: 'write:statuses',
                    website: 'https://github.com/rstockm/mastothread'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return {
                clientId: data.client_id,
                clientSecret: data.client_secret
            };
        } catch (error) {
            console.error('Error registering app:', error);
            throw error;
        }
    }

    // Start OAuth flow
    async function startMastodonLogin() {
        const server = $('#mastodonServer').val().trim();
        if (!server) {
            alert('Please enter a Mastodon server URL');
            return;
        }

        // Normalize server URL
        const normalizedServer = server.startsWith('http') ? server : 'https://' + server;
        
        try {
            $('#mastodonStatus').text('Registering app...').removeClass('error');
            
            const { clientId, clientSecret } = await registerMastodonApp(normalizedServer);
            
            mastodonConfig.server = normalizedServer;
            mastodonConfig.clientId = clientId;
            mastodonConfig.clientSecret = clientSecret;
            saveMastodonConfig();

            // Redirect to authorization
            const authUrl = new URL(`${normalizedServer}/oauth/authorize`);
            authUrl.searchParams.append('client_id', clientId);
            authUrl.searchParams.append('scope', 'write:statuses');
            authUrl.searchParams.append('redirect_uri', window.location.origin + window.location.pathname);
            authUrl.searchParams.append('response_type', 'code');

            window.location.href = authUrl.toString();
        } catch (error) {
            console.error('Login error:', error);
            $('#mastodonStatus').text('Login failed: ' + error.message).addClass('error');
        }
    }

    // Handle OAuth callback
    async function handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code && mastodonConfig.clientId) {
            try {
                $('#mastodonStatus').text('Getting access token...');
                
                const response = await fetch(`${mastodonConfig.server}/oauth/token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        client_id: mastodonConfig.clientId,
                        client_secret: mastodonConfig.clientSecret,
                        redirect_uri: window.location.origin + window.location.pathname,
                        grant_type: 'authorization_code',
                        code: code,
                        scope: 'write:statuses'
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                mastodonConfig.accessToken = data.access_token;
                mastodonConfig.isLoggedIn = true;
                saveMastodonConfig();
                updateMastodonUI();

                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (error) {
                console.error('Token exchange error:', error);
                $('#mastodonStatus').text('Authentication failed: ' + error.message).addClass('error');
            }
        }
    }

    // Post a status to Mastodon
    async function postMastodonStatus(content, replyToId = null) {
        try {
            const response = await fetch(`${mastodonConfig.server}/api/v1/statuses`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${mastodonConfig.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status: content,
                    in_reply_to_id: replyToId,
                    visibility: 'public'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error posting status:', error);
            throw error;
        }
    }

    // Post entire thread
    async function postMastodonThread() {
        const text = $('#inputText').val();
        const chunks = splitText(text);
        
        if (chunks.length === 0) {
            alert('No content to post');
            return;
        }

        const paginationEnabled = $('#paginationCheckbox').prop('checked');
        const totalPosts = chunks.length;

        $('#postThread').prop('disabled', true);
        $('#postingProgress').show();
        $('#progressBar').css('width', '0%');
        $('#progressText').text('Starting thread...');

        try {
            let replyToId = null;
            
            for (let i = 0; i < chunks.length; i++) {
                let content = chunks[i];
                
                // Add pagination if enabled
                if (paginationEnabled) {
                    content += `\n${i + 1}/${totalPosts}`;
                }

                $('#progressText').text(`Posting ${i + 1}/${totalPosts}...`);
                
                const post = await postMastodonStatus(content, replyToId);
                replyToId = post.id;

                // Update progress
                const progress = ((i + 1) / totalPosts) * 100;
                $('#progressBar').css('width', progress + '%');

                // Add a small delay to avoid rate limiting
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            $('#progressText').text('Thread posted successfully!');
            setTimeout(() => {
                $('#postingProgress').hide();
            }, 3000);

        } catch (error) {
            console.error('Error posting thread:', error);
            $('#progressText').text('Error: ' + error.message).css('color', 'red');
            alert('Failed to post thread: ' + error.message);
        } finally {
            $('#postThread').prop('disabled', false);
        }
    }

    // Logout from Mastodon
    function mastodonLogout() {
        mastodonConfig = {
            server: '',
            clientId: '',
            clientSecret: '',
            accessToken: '',
            isLoggedIn: false
        };
        localStorage.removeItem('mastodonConfig');
        updateMastodonUI();
    }

    // Event handlers for Mastodon functionality
    $('#mastodonLogin').on('click', startMastodonLogin);
    $('#mastodonLogout').on('click', mastodonLogout);
    $('#postThread').on('click', postMastodonThread);

    // Initialize Mastodon functionality
    loadMastodonConfig();
    handleOAuthCallback();
    
    


// Define an array of subtitles and a counter for tracking the current subtitle
const subtitles = [
    "Weaving Stories, One Post at a Time.",
    "Stitching Ideas into Threads.",
    "From Long Reads to Bitesize Posts!",
    "Unraveling Thoughts, Thread by Thread.",
    "Crafting Narratives, Mastodon Style!",
    "Divide, Post, Conquer!",
    "Your Ideas, Seamlessly Threaded.",
    "Transform Monologues into Dialogues!",
    "Empowering Lengthy Ideas on Mastodon!",
    "Compose, Split, Share!"
];

let currentSubtitleIndex = 0;

function changeSubtitle() {
    currentSubtitleIndex++;
    if (currentSubtitleIndex >= subtitles.length) {
        currentSubtitleIndex = 0; // Reset to the beginning
    }
    $(".subtitle").text(subtitles[currentSubtitleIndex]);
}

// Initially set the first subtitle and then change it every 10 seconds
$(".subtitle").text(subtitles[currentSubtitleIndex]);
setInterval(changeSubtitle, 10000);

$('#inputText').trigger('input');
    
});
