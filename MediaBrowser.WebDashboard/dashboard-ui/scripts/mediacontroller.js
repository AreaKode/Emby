﻿(function ($, window) {

    var currentDisplayInfo;
    function mirrorItem(info) {

        var item = info.item;

        MediaController.getCurrentPlayer().displayContent({

            ItemName: item.Name,
            ItemId: item.Id,
            ItemType: item.Type,
            Context: info.context
        });
    }

    function mirrorIfEnabled() {

        var info = currentDisplayInfo;

        if (info && MediaController.enableDisplayMirroring()) {

            var player = MediaController.getPlayerInfo();

            if (!player.isLocalPlayer && player.supportedCommands.indexOf('DisplayContent') != -1) {
                mirrorItem(info);
            }
        }
    }

    function monitorPlayer(player) {

        Events.on(player, 'playbackstart', function (e, state) {

            var info = {
                QueueableMediaTypes: state.NowPlayingItem.MediaType,
                ItemId: state.NowPlayingItem.Id,
                NowPlayingItem: state.NowPlayingItem
            };

            info = $.extend(info, state.PlayState);

            ApiClient.reportPlaybackStart(info);

        });

        Events.on(player, 'playbackstop', function (e, state) {

            var stopInfo = {
                itemId: state.NowPlayingItem.Id,
                mediaSourceId: state.PlayState.MediaSourceId,
                positionTicks: state.PlayState.PositionTicks
            };

            if (state.PlayState.LiveStreamId) {
                stopInfo.LiveStreamId = state.PlayState.LiveStreamId;
            }

            if (state.PlayState.PlaySessionId) {
                stopInfo.PlaySessionId = state.PlayState.PlaySessionId;
            }

            ApiClient.reportPlaybackStopped(stopInfo);
        });
    }

    function showPlayerSelection() {

        var playerInfo = MediaController.getPlayerInfo();

        if (!playerInfo.isLocalPlayer) {
            showActivePlayerMenu(playerInfo);
            return;
        }

        Dashboard.showModalLoadingMsg();

        MediaController.getTargets().done(function (targets) {

            var menuItems = targets.map(function (t) {

                var name = t.name;

                if (t.appName && t.appName != t.name) {
                    name += " - " + t.appName;
                }

                return {
                    name: name,
                    id: t.id,
                    ironIcon: 'tablet-android'
                };

            });

            require(['actionsheet'], function () {

                Dashboard.hideModalLoadingMsg();

                ActionSheetElement.show({
                    title: Globalize.translate('HeaderSelectPlayer'),
                    items: menuItems,
                    callback: function (id) {

                        var target = targets.filter(function (t) {
                            return t.id == id;
                        })[0];

                        MediaController.trySetActivePlayer(target.playerName, target);

                        mirrorIfEnabled();
                    }
                });
            });
        });
    }

    function showActivePlayerMenu(playerInfo) {

        var id = 'dlg' + new Date().getTime();
        var html = '';

        var style = "";

        html += '<paper-dialog id="' + id + '" entry-animation="fade-in-animation" exit-animation="fade-out-animation" with-backdrop style="' + style + '">';

        html += '<h2>';
        html += (playerInfo.deviceName || playerInfo.name);
        html += '</h2>';

        html += '<div style="padding:0 2em;">';

        if (playerInfo.supportedCommands.indexOf('DisplayContent') != -1) {

            html += '<div>';
            var checkedHtml = MediaController.enableDisplayMirroring() ? ' checked' : '';
            html += '<paper-checkbox class="chkMirror"' + checkedHtml + '>' + Globalize.translate('OptionEnableDisplayMirroring') + '</paper-checkbox>';
            html += '</div>';
        }

        html += '</div>';

        html += '<div class="buttons">';

        // On small layouts papepr dialog doesn't respond very well. this button isn't that important here anyway.
        if (screen.availWidth >= 600) {
            html += '<paper-button onclick="Dashboard.navigate(\'nowplaying.html\');" dialog-dismiss>' + Globalize.translate('ButtonRemoteControl') + '</paper-button>';
        }

        html += '<paper-button dialog-dismiss onclick="MediaController.disconnectFromPlayer();">' + Globalize.translate('ButtonDisconnect') + '</paper-button>';
        html += '<paper-button dialog-dismiss>' + Globalize.translate('ButtonCancel') + '</paper-button>';
        html += '</div>';

        html += '</paper-dialog>';

        $(document.body).append(html);

        setTimeout(function () {

            var dlg = document.getElementById(id);

            $('.chkMirror', dlg).on('change', onMirrorChange);

            dlg.open();

            // Has to be assigned a z-index after the call to .open() 
            $(dlg).on('iron-overlay-closed', function () {
                $(this).remove();
            });

        }, 100);
    }

    function onMirrorChange() {
        MediaController.enableDisplayMirroring(this.checked);
    }

    function bindKeys(controller) {

        var self = this;
        var keyResult = {};

        self.keyBinding = function (e) {

            if (bypass()) return;

            Logger.log("keyCode", e.keyCode);

            if (keyResult[e.keyCode]) {
                e.preventDefault();
                keyResult[e.keyCode](e);
            }
        };

        self.keyPrevent = function (e) {

            if (bypass()) return;

            var codes = [32, 38, 40, 37, 39, 81, 77, 65, 84, 83, 70];

            if (codes.indexOf(e.keyCode) != -1) {
                e.preventDefault();
            }
        };

        keyResult[32] = function () { // spacebar

            var player = controller.getCurrentPlayer();

            player.getPlayerState().done(function (result) {

                var state = result;

                if (state.NowPlayingItem && state.PlayState) {
                    if (state.PlayState.IsPaused) {
                        player.unpause();
                    } else {
                        player.pause();
                    }
                }
            });
        };

        var bypass = function () {
            // Get active elem to see what type it is
            var active = document.activeElement;
            var type = active.type || active.tagName.toLowerCase();
            return (type === "text" || type === "select" || type === "textarea" || type == "password");
        };
    }

    function mediaController() {

        var self = this;
        var currentPlayer;
        var currentTargetInfo;
        var players = [];

        var keys = new bindKeys(self);

        $(window).on("keydown", keys.keyBinding).on("keypress", keys.keyPrevent).on("keyup", keys.keyPrevent);

        self.registerPlayer = function (player) {

            players.push(player);

            if (player.isLocalPlayer) {
                monitorPlayer(player);
            }

            Events.on(player, 'playbackstop', onPlaybackStop);
            Events.on(player, 'beforeplaybackstart', onBeforePlaybackStart);
        };

        function onBeforePlaybackStart(e, state) {
            $(self).trigger('beforeplaybackstart', [state, this]);
        }

        function onPlaybackStart(e, state) {
            $(self).trigger('playbackstart', [state, this]);
        }

        function onPlaybackStop(e, state) {
            $(self).trigger('playbackstop', [state, this]);
        }

        self.getPlayerInfo = function () {

            var player = currentPlayer || {};
            var target = currentTargetInfo || {};

            return {

                name: player.name,
                isLocalPlayer: player.isLocalPlayer,
                id: target.id,
                deviceName: target.deviceName,
                playableMediaTypes: target.playableMediaTypes,
                supportedCommands: target.supportedCommands
            };
        };

        function triggerPlayerChange(newPlayer, newTarget) {

            $(self).trigger('playerchange', [newPlayer, newTarget]);
        }

        self.setActivePlayer = function (player, targetInfo) {

            if (typeof (player) === 'string') {
                player = players.filter(function (p) {
                    return p.name == player;
                })[0];
            }

            if (!player) {
                throw new Error('null player');
            }

            currentPairingId = null;
            currentPlayer = player;
            currentTargetInfo = targetInfo;

            Logger.log('Active player: ' + JSON.stringify(currentTargetInfo));

            triggerPlayerChange(player, targetInfo);
        };

        var currentPairingId = null;
        self.trySetActivePlayer = function (player, targetInfo) {

            if (typeof (player) === 'string') {
                player = players.filter(function (p) {
                    return p.name == player;
                })[0];
            }

            if (!player) {
                throw new Error('null player');
            }

            if (currentPairingId == targetInfo.id) {
                return;
            }

            currentPairingId = targetInfo.id;

            player.tryPair(targetInfo).done(function () {

                currentPlayer = player;
                currentTargetInfo = targetInfo;

                Logger.log('Active player: ' + JSON.stringify(currentTargetInfo));

                triggerPlayerChange(player, targetInfo);
            });
        };

        self.trySetActiveDeviceName = function (name) {

            function normalizeName(t) {
                return t.toLowerCase().replace(' ', '');
            }

            name = normalizeName(name);

            self.getTargets().done(function (result) {

                var target = result.filter(function (p) {
                    return normalizeName(p.name) == name;
                })[0];

                if (target) {
                    self.trySetActivePlayer(target.playerName, target);
                }

            });
        };

        self.setDefaultPlayerActive = function () {

            var player = self.getDefaultPlayer();
            var target = player.getTargets()[0];

            self.setActivePlayer(player, target);
        };

        self.removeActivePlayer = function (name) {

            if (self.getPlayerInfo().name == name) {
                self.setDefaultPlayerActive();
            }

        };

        self.removeActiveTarget = function (id) {

            if (self.getPlayerInfo().id == id) {
                self.setDefaultPlayerActive();
            }
        };

        self.disconnectFromPlayer = function () {

            var playerInfo = self.getPlayerInfo();

            if (playerInfo.supportedCommands.indexOf('EndSession') != -1) {

                var options = {
                    callback: function (result) {

                        if (result == 0) {
                            MediaController.getCurrentPlayer().endSession();
                        }

                        if (result != 2) {
                            self.setDefaultPlayerActive();
                        }
                    },
                    message: Globalize.translate('ConfirmEndPlayerSession'),
                    title: Globalize.translate('HeaderDisconnectFromPlayer'),
                    buttons: [Globalize.translate('ButtonYes'), Globalize.translate('ButtonNo'), Globalize.translate('ButtonCancel')]
                };

                Dashboard.dialog(options);

            } else {

                self.setDefaultPlayerActive();
            }
        };

        self.getPlayers = function () {
            return players;
        };

        self.getTargets = function () {

            var deferred = $.Deferred();

            var promises = players.map(function (p) {
                return p.getTargets();
            });

            $.when.apply($, promises).done(function () {

                var targets = [];

                for (var i = 0; i < arguments.length; i++) {

                    var subTargets = arguments[i];

                    for (var j = 0; j < subTargets.length; j++) {

                        targets.push(subTargets[j]);
                    }

                }

                targets = targets.sort(function (a, b) {

                    var aVal = a.isLocalPlayer ? 0 : 1;
                    var bVal = b.isLocalPlayer ? 0 : 1;

                    aVal = aVal.toString() + a.name;
                    bVal = bVal.toString() + b.name;

                    return aVal.localeCompare(bVal);
                });

                deferred.resolveWith(null, [targets]);
            });

            return deferred.promise();
        };

        function doWithPlaybackValidation(player, fn) {

            if (!player.isLocalPlayer) {
                fn();
                return;
            }

            requirejs(["scripts/registrationservices"], function () {
                RegistrationServices.validateFeature('playback').done(fn);
            });
        }

        self.toggleDisplayMirroring = function () {
            self.enableDisplayMirroring(!self.enableDisplayMirroring());
        };

        self.enableDisplayMirroring = function (enabled) {

            if (enabled != null) {

                var val = enabled ? '1' : '0';
                appStorage.setItem('displaymirror--' + Dashboard.getCurrentUserId(), val);

                if (enabled) {
                    mirrorIfEnabled();
                }
                return;
            }

            return (appStorage.getItem('displaymirror--' + Dashboard.getCurrentUserId()) || '') != '0';
        };

        self.play = function (options) {

            doWithPlaybackValidation(currentPlayer, function () {
                if (typeof (options) === 'string') {
                    options = { ids: [options] };
                }

                currentPlayer.play(options);
            });
        };

        self.shuffle = function (id) {

            doWithPlaybackValidation(currentPlayer, function () {
                currentPlayer.shuffle(id);
            });
        };

        self.instantMix = function (id) {
            doWithPlaybackValidation(currentPlayer, function () {
                currentPlayer.instantMix(id);
            });
        };

        self.queue = function (options) {

            if (typeof (options) === 'string') {
                options = { ids: [options] };
            }

            currentPlayer.queue(options);
        };

        self.queueNext = function (options) {

            if (typeof (options) === 'string') {
                options = { ids: [options] };
            }

            currentPlayer.queueNext(options);
        };

        self.canPlay = function (item) {

            return self.canPlayByAttributes(item.Type, item.MediaType, item.PlayAccess, item.LocationType);
        };

        self.canPlayByAttributes = function (itemType, mediaType, playAccess, locationType) {

            if (playAccess != 'Full') {
                return false;
            }

            if (locationType == "Virtual") {
                return false;
            }

            if (itemType == "Program") {
                return false;
            }

            if (itemType == "MusicGenre" || itemType == "Season" || itemType == "Series" || itemType == "BoxSet" || itemType == "MusicAlbum" || itemType == "MusicArtist" || itemType == "Playlist") {
                return true;
            }

            return self.getPlayerInfo().playableMediaTypes.indexOf(mediaType) != -1;
        };

        self.canQueueMediaType = function (mediaType, itemType) {

            if (itemType == 'MusicAlbum' || itemType == 'MusicArtist' || itemType == 'MusicGenre') {
                mediaType = 'Audio';
            }

            return currentPlayer.canQueueMediaType(mediaType);
        };

        self.getLocalPlayer = function () {

            return currentPlayer.isLocalPlayer ?

                currentPlayer :

                players.filter(function (p) {
                    return p.isLocalPlayer;
                })[0];
        };

        self.getDefaultPlayer = function () {

            return currentPlayer.isLocalPlayer ?

                currentPlayer :

                players.filter(function (p) {
                    return p.isDefaultPlayer;
                })[0];
        };

        self.getCurrentPlayer = function () {

            return currentPlayer;
        };

        self.pause = function () {
            currentPlayer.pause();
        };

        self.stop = function () {
            currentPlayer.stop();
        };

        self.unpause = function () {
            currentPlayer.unpause();
        };

        self.seek = function (position) {
            currentPlayer.seek(position);
        };

        self.currentPlaylistIndex = function (i) {

            if (i == null) {
                // TODO: Get this implemented in all of the players
                return currentPlayer.currentPlaylistIndex ? currentPlayer.currentPlaylistIndex() : -1;
            }

            currentPlayer.currentPlaylistIndex(i);
        };

        self.removeFromPlaylist = function (i) {
            currentPlayer.removeFromPlaylist(i);
        };

        self.nextTrack = function () {
            currentPlayer.nextTrack();
        };

        self.previousTrack = function () {
            currentPlayer.previousTrack();
        };

        self.mute = function () {
            currentPlayer.mute();
        };

        self.unMute = function () {
            currentPlayer.unMute();
        };

        self.toggleMute = function () {
            currentPlayer.toggleMute();
        };

        self.volumeDown = function () {
            currentPlayer.volumeDown();
        };

        self.volumeUp = function () {
            currentPlayer.volumeUp();
        };

        self.setRepeatMode = function (mode) {
            currentPlayer.setRepeatMode(mode);
        };

        self.playlist = function () {
            return currentPlayer.playlist || [];
        };

        self.sendCommand = function (cmd, player) {

            player = player || self.getLocalPlayer();

            // Full list
            // https://github.com/MediaBrowser/MediaBrowser/blob/master/MediaBrowser.Model/Session/GeneralCommand.cs#L23
            Logger.log('MediaController received command: ' + cmd.Name);
            switch (cmd.Name) {

                case 'SetRepeatMode':
                    player.setRepeatMode(cmd.Arguments.RepeatMode);
                    break;
                case 'VolumeUp':
                    player.volumeUp();
                    break;
                case 'VolumeDown':
                    player.volumeDown();
                    break;
                case 'Mute':
                    player.mute();
                    break;
                case 'Unmute':
                    player.unMute();
                    break;
                case 'ToggleMute':
                    player.toggleMute();
                    break;
                case 'SetVolume':
                    player.setVolume(cmd.Arguments.Volume);
                    break;
                case 'SetAudioStreamIndex':
                    player.setAudioStreamIndex(parseInt(cmd.Arguments.Index));
                    break;
                case 'SetSubtitleStreamIndex':
                    player.setSubtitleStreamIndex(parseInt(cmd.Arguments.Index));
                    break;
                case 'ToggleFullscreen':
                    player.toggleFullscreen();
                    break;
                default:
                    {
                        if (player.isLocalPlayer) {
                            // Not player-related
                            Dashboard.processGeneralCommand(cmd);
                        } else {
                            player.sendCommand(cmd);
                        }
                        break;
                    }
            }
        };

        // TOOD: This doesn't really belong here
        self.getNowPlayingNameHtml = function (nowPlayingItem, includeNonNameInfo) {

            var topText = nowPlayingItem.Name;

            if (nowPlayingItem.MediaType == 'Video') {
                if (nowPlayingItem.IndexNumber != null) {
                    topText = nowPlayingItem.IndexNumber + " - " + topText;
                }
                if (nowPlayingItem.ParentIndexNumber != null) {
                    topText = nowPlayingItem.ParentIndexNumber + "." + topText;
                }
            }

            var bottomText = '';

            if (nowPlayingItem.Artists && nowPlayingItem.Artists.length) {
                bottomText = topText;
                topText = nowPlayingItem.Artists[0];
            }
            else if (nowPlayingItem.SeriesName || nowPlayingItem.Album) {
                bottomText = topText;
                topText = nowPlayingItem.SeriesName || nowPlayingItem.Album;
            }
            else if (nowPlayingItem.ProductionYear && includeNonNameInfo !== false) {
                bottomText = nowPlayingItem.ProductionYear;
            }

            return bottomText ? topText + '<br/>' + bottomText : topText;
        };

        self.showPlaybackInfoErrorMessage = function (errorCode) {

            // This timeout is messy, but if jqm is in the act of hiding a popup, it will not show a new one
            // If we're coming from the popup play menu, this will be a problem

            setTimeout(function () {
                Dashboard.alert({
                    message: Globalize.translate('MessagePlaybackError' + errorCode),
                    title: Globalize.translate('HeaderPlaybackError')
                });
            }, 300);

        };

        function getPlaybackInfoFromLocalMediaSource(itemId, deviceProfile, startPosition, mediaSource) {

            mediaSource.SupportsDirectPlay = true;

            return {

                MediaSources: [mediaSource],

                // Just dummy this up
                PlaySessionId: new Date().getTime().toString()
            };

        }

        self.getPlaybackInfo = function (itemId, deviceProfile, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex, liveStreamId) {

            var deferred = DeferredBuilder.Deferred();

            require(['localassetmanager'], function () {

                var serverInfo = ApiClient.serverInfo();

                if (serverInfo.Id) {
                    LocalAssetManager.getLocalMediaSource(serverInfo.Id, itemId).done(function (localMediaSource) {
                        // Use the local media source if a specific one wasn't requested, or the smae one was requested
                        if (localMediaSource && (!mediaSource || mediaSource.Id == localMediaSource.Id)) {

                            var playbackInfo = getPlaybackInfoFromLocalMediaSource(itemId, deviceProfile, startPosition, localMediaSource);

                            deferred.resolveWith(null, [playbackInfo]);
                            return;
                        }

                        getPlaybackInfoWithoutLocalMediaSource(itemId, deviceProfile, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex, liveStreamId, deferred);
                    });
                    return;
                }

                getPlaybackInfoWithoutLocalMediaSource(itemId, deviceProfile, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex, liveStreamId, deferred);
            });

            return deferred.promise();
        }

        function getPlaybackInfoWithoutLocalMediaSource(itemId, deviceProfile, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex, liveStreamId, deferred) {
            self.getPlaybackInfoInternal(itemId, deviceProfile, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex, liveStreamId).done(function (result) {
                deferred.resolveWith(null, [result]);
            }).fail(function () {
                deferred.reject();
            });
        }

        self.getPlaybackInfoInternal = function (itemId, deviceProfile, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex, liveStreamId) {

            var postData = {
                DeviceProfile: deviceProfile
            };

            var query = {
                UserId: Dashboard.getCurrentUserId(),
                StartTimeTicks: startPosition || 0
            };

            if (audioStreamIndex != null) {
                query.AudioStreamIndex = audioStreamIndex;
            }
            if (subtitleStreamIndex != null) {
                query.SubtitleStreamIndex = subtitleStreamIndex;
            }
            if (mediaSource) {
                query.MediaSourceId = mediaSource.Id;
            }
            if (liveStreamId) {
                query.LiveStreamId = liveStreamId;
            }

            return ApiClient.ajax({
                url: ApiClient.getUrl('Items/' + itemId + '/PlaybackInfo', query),
                type: 'POST',
                data: JSON.stringify(postData),
                contentType: "application/json",
                dataType: "json"

            });
        }

        self.getLiveStream = function (itemId, playSessionId, deviceProfile, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex) {

            var postData = {
                DeviceProfile: deviceProfile,
                OpenToken: mediaSource.OpenToken
            };

            var query = {
                UserId: Dashboard.getCurrentUserId(),
                StartTimeTicks: startPosition || 0,
                ItemId: itemId,
                PlaySessionId: playSessionId
            };

            if (audioStreamIndex != null) {
                query.AudioStreamIndex = audioStreamIndex;
            }
            if (subtitleStreamIndex != null) {
                query.SubtitleStreamIndex = subtitleStreamIndex;
            }

            return ApiClient.ajax({
                url: ApiClient.getUrl('LiveStreams/Open', query),
                type: 'POST',
                data: JSON.stringify(postData),
                contentType: "application/json",
                dataType: "json"

            });
        };

        self.supportsDirectPlay = function (mediaSource) {

            var deferred = $.Deferred();
            if (mediaSource.SupportsDirectPlay) {

                if (mediaSource.Protocol == 'Http' && !mediaSource.RequiredHttpHeaders.length) {

                    // If this is the only way it can be played, then allow it
                    if (!mediaSource.SupportsDirectStream && !mediaSource.SupportsTranscoding) {
                        deferred.resolveWith(null, [true]);
                    }
                    else {
                        var val = mediaSource.Path.toLowerCase().replace('https:', 'http').indexOf(ApiClient.serverAddress().toLowerCase().replace('https:', 'http').substring(0, 14)) == 0;
                        deferred.resolveWith(null, [val]);
                    }
                }

                if (mediaSource.Protocol == 'File') {

                    require(['localassetmanager'], function () {

                        LocalAssetManager.fileExists(mediaSource.Path).done(function (exists) {
                            Logger.log('LocalAssetManager.fileExists: path: ' + mediaSource.Path + ' result: ' + exists);
                            deferred.resolveWith(null, [exists]);
                        });
                    });
                }
            }
            else {
                deferred.resolveWith(null, [false]);
            }
            return deferred.promise();
        };

        self.showPlayerSelection = showPlayerSelection;
    }

    window.MediaController = new mediaController();

    function onWebSocketMessageReceived(e, msg) {

        var localPlayer;

        if (msg.MessageType === "Play") {

            localPlayer = MediaController.getLocalPlayer();

            if (msg.Data.PlayCommand == "PlayNext") {
                localPlayer.queueNext({ ids: msg.Data.ItemIds });
            }
            else if (msg.Data.PlayCommand == "PlayLast") {
                localPlayer.queue({ ids: msg.Data.ItemIds });
            }
            else {
                localPlayer.play({ ids: msg.Data.ItemIds, startPositionTicks: msg.Data.StartPositionTicks });
            }

        }
        else if (msg.MessageType === "ServerShuttingDown") {
            MediaController.setDefaultPlayerActive();
        }
        else if (msg.MessageType === "ServerRestarting") {
            MediaController.setDefaultPlayerActive();
        }
        else if (msg.MessageType === "Playstate") {

            localPlayer = MediaController.getLocalPlayer();

            if (msg.Data.Command === 'Stop') {
                localPlayer.stop();
            }
            else if (msg.Data.Command === 'Pause') {
                localPlayer.pause();
            }
            else if (msg.Data.Command === 'Unpause') {
                localPlayer.unpause();
            }
            else if (msg.Data.Command === 'Seek') {
                localPlayer.seek(msg.Data.SeekPositionTicks);
            }
            else if (msg.Data.Command === 'NextTrack') {
                localPlayer.nextTrack();
            }
            else if (msg.Data.Command === 'PreviousTrack') {
                localPlayer.previousTrack();
            }
        }
        else if (msg.MessageType === "GeneralCommand") {

            var cmd = msg.Data;

            localPlayer = MediaController.getLocalPlayer();

            MediaController.sendCommand(cmd, localPlayer);
        }
    }

    function initializeApiClient(apiClient) {
        $(apiClient).off("websocketmessage", onWebSocketMessageReceived).on("websocketmessage", onWebSocketMessageReceived);
    }

    Dashboard.ready(function () {

        if (window.ApiClient) {
            initializeApiClient(window.ApiClient);
        }

        $(ConnectionManager).on('apiclientcreated', function (e, apiClient) {
            initializeApiClient(apiClient);
        });
    });

    function onCastButtonClicked() {

        showPlayerSelection();
    }

    $(document).on('headercreated', function () {

        $('.btnCast').off('click', onCastButtonClicked).on('click', onCastButtonClicked);

    }).on('pagebeforeshow', ".page", function () {

        var page = this;

        currentDisplayInfo = null;

    }).on('displayingitem', ".libraryPage", function (e, info) {

        currentDisplayInfo = info;

        mirrorIfEnabled(info);
    });

})(jQuery, window);