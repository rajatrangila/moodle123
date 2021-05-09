// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonTabs } from '@ionic/angular';
import { BackButtonEvent } from '@ionic/core';
import { Subscription } from 'rxjs';

import { CoreApp } from '@services/app';
import { CoreTextUtils } from '@services/utils/text';
import { CoreEvents, CoreEventObserver } from '@singletons/events';
import { CoreMainMenu, CoreMainMenuProvider } from '../../services/mainmenu';
import { CoreMainMenuDelegate, CoreMainMenuHandlerToDisplay } from '../../services/mainmenu-delegate';
import { CoreDomUtils } from '@services/utils/dom';
import { Translate } from '@singletons';

/**
 * Page that displays the main menu of the app.
 */
@Component({
    selector: 'page-core-mainmenu',
    templateUrl: 'menu.html',
    styleUrls: ['menu.scss'],
})
export class CoreMainMenuPage implements OnInit, OnDestroy {

    tabs: CoreMainMenuHandlerToDisplay[] = [];
    allHandlers?: CoreMainMenuHandlerToDisplay[];
    loaded = false;
    showTabs = false;
    tabsPlacement = 'bottom';
    hidden = false;
    morePageName = CoreMainMenuProvider.MORE_PAGE_NAME;

    protected subscription?: Subscription;
    protected keyboardObserver?: CoreEventObserver;
    protected resizeFunction: () => void;
    protected backButtonFunction: (event: BackButtonEvent) => void;
    protected selectHistory: string[] = [];
    protected selectedTab?: string;
    protected firstSelectedTab?: string;

    @ViewChild('mainTabs') mainTabs?: IonTabs;

    constructor(
        protected route: ActivatedRoute,
        protected changeDetector: ChangeDetectorRef,
        protected router: Router,
    ) {
        this.resizeFunction = this.initHandlers.bind(this);
        this.backButtonFunction = this.backButtonClicked.bind(this);
    }

    /**
     * Initialize the component.
     */
    ngOnInit(): void {
        this.showTabs = true;

        this.subscription = CoreMainMenuDelegate.getHandlersObservable().subscribe((handlers) => {
            // Remove the handlers that should only appear in the More menu.
            this.allHandlers = handlers.filter((handler) => !handler.onlyInMore);

            this.initHandlers();
        });

        window.addEventListener('resize', this.resizeFunction);
        document.addEventListener('ionBackButton', this.backButtonFunction);

        if (CoreApp.isIOS()) {
            // In iOS, the resize event is triggered before the keyboard is opened/closed and not triggered again once done.
            // Init handlers again once keyboard is closed since the resize event doesn't have the updated height.
            this.keyboardObserver = CoreEvents.on(CoreEvents.KEYBOARD_CHANGE, (kbHeight: number) => {
                if (kbHeight === 0) {
                    this.initHandlers();

                    // If the device is slow it can take a bit more to update the window height. Retry in a few ms.
                    setTimeout(() => {
                        this.initHandlers();
                    }, 250);
                }
            });
        }
    }

    /**
     * Init handlers on change (size or handlers).
     */
    initHandlers(): void {
        if (this.allHandlers) {
            this.tabsPlacement = CoreMainMenu.getTabPlacement();

            const handlers = this.allHandlers.slice(0, CoreMainMenu.getNumItems()); // Get main handlers.

            // Re-build the list of tabs. If a handler is already in the list, use existing object to prevent re-creating the tab.
            const newTabs: CoreMainMenuHandlerToDisplay[] = [];

            for (let i = 0; i < handlers.length; i++) {
                const handler = handlers[i];

                // Check if the handler is already in the tabs list. If so, use it.
                const tab = this.tabs.find((tab) => tab.title == handler.title && tab.icon == handler.icon);

                tab ? tab.hide = false : null;
                handler.hide = false;

                newTabs.push(tab || handler);
            }

            this.tabs = newTabs;

            // Sort them by priority so new handlers are in the right position.
            this.tabs.sort((a, b) => (b.priority || 0) - (a.priority || 0));

            this.loaded = CoreMainMenuDelegate.areHandlersLoaded();
        }
    }

    /**
     * Change tabs visibility to show/hide them from the view.
     *
     * @param visible If show or hide the tabs.
     */
    changeVisibility(visible: boolean): void {
        if (this.hidden == visible) {
            // Change needed.
            this.hidden = !visible;

            /* setTimeout(() => {
                this.viewCtrl.getContent().resize();
            });*/
        }
    }

    /**
     * Page destroyed.
     */
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        window.removeEventListener('resize', this.resizeFunction);
        document.removeEventListener('ionBackButton', this.backButtonFunction);
        this.keyboardObserver?.off();
    }

    /**
     * Tab clicked.
     *
     * @param e Event.
     * @param page Page of the tab.
     */
    async tabClicked(e: Event, page: string): Promise<void> {
        if (this.mainTabs?.getSelected() != page) {
            // Just change the tab.
            return;
        }

        const trimmedUrl = CoreTextUtils.trimCharacter(this.router.url, '/');

        // Current tab was clicked. Check if user is already at root level.
        if (trimmedUrl  == CoreTextUtils.trimCharacter(page, '/')) {
            // Already at root level, nothing to do.
            return;
        }

        // Ask the user if he wants to go back to the root page of the tab.
        e.preventDefault();
        e.stopPropagation();

        try {
            const tab = this.tabs.find((tab) => tab.page == page);

            // Use tab's subPage to check if user is already at root level.
            if (tab?.subPage && trimmedUrl ==
                CoreTextUtils.trimCharacter(CoreTextUtils.concatenatePaths(tab.page, tab.subPage), '/')) {
                // Already at root level, nothing to do.
                return;
            }

            if (tab?.title) {
                await CoreDomUtils.showConfirm(Translate.instant('core.confirmgotabroot', {
                    name: Translate.instant(tab.title),
                }));
            } else {
                await CoreDomUtils.showConfirm(Translate.instant('core.confirmgotabrootdefault'));
            }

            // User confirmed, go to root.
            this.mainTabs?.select(page);
        } catch {
            // User canceled.
        }
    }

    /**
     * Selected tab has changed.
     *
     * @param event Event.
     */
    tabChanged(event: {tab: string}): void {
        this.selectedTab = event.tab;
        this.firstSelectedTab = this.firstSelectedTab ?? event.tab;
        this.selectHistory.push(event.tab);
    }

    /**
     * Back button clicked.
     *
     * @param event Event.
     */
    protected backButtonClicked(event: BackButtonEvent): void {
        event.detail.register(20, (processNextHandler: () => void) => {
            if (this.selectHistory.length > 1) {
                // The previous page in history is not the last one, we need the previous one.
                const previousTab = this.selectHistory[this.selectHistory.length - 2];

                // Remove curent and previous tabs from history.
                this.selectHistory = this.selectHistory.filter((tab) => this.selectedTab != tab && previousTab != tab);

                this.mainTabs?.select(previousTab);

                return;
            }

            if (this.firstSelectedTab && this.selectedTab != this.firstSelectedTab) {
                // All history is gone but we are not in the first selected tab.
                this.selectHistory = [];
                this.mainTabs?.select(this.firstSelectedTab);

                return;
            }

            processNextHandler();
        });
    }

}
