"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bell, Boxes, ChevronDown, CircleDollarSign, ClipboardCheck,
  LayoutDashboard, Megaphone, PackagePlus, Plus, ReceiptText, Search,
  Settings, ShoppingBag, SlidersHorizontal, Sparkles, WalletCards,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";

const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/products", label: "Products", icon: Boxes },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/cash-settlements", label: "Cash settlements", icon: WalletCards },
];

const insightNav = [
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/data-checks", label: "Data checks", icon: ClipboardCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

const titleMap: Record<string, string> = {
  dashboard: "Business overview", orders: "Orders", products: "Products",
  marketing: "Marketing", expenses: "Expenses", "cash-settlements": "Cash settlements",
  reports: "Reports", "data-checks": "Data checks", settings: "Settings", new: "Create order",
};

function pathIsActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function NavGroup({ label, items }: { label: string; items: typeof primaryNav }) {
  const pathname = usePathname();
  return (
    <SidebarGroup className="px-3 py-2">
      <SidebarGroupLabel className="px-2 uppercase tracking-[0.14em] text-sidebar-foreground/45">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={pathIsActive(pathname, item.href)}
                tooltip={item.label}
                render={<Link href={item.href} />}
                className="h-9 rounded-lg px-2.5 data-active:bg-sidebar-accent data-active:text-white"
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-950/20"><Sparkles className="size-4" /></span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block text-sm font-semibold tracking-tight text-white">NexaNotion</span>
            <span className="block text-[11px] text-sidebar-foreground/55">Business workspace</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="py-3">
        <NavGroup label="Operate" items={primaryNav} />
        <NavGroup label="Understand" items={insightNav} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="rounded-lg bg-sidebar-accent/65 p-3 group-data-[collapsible=icon]:hidden">
          <p className="text-xs font-medium text-white">Phase 1 prototype</p>
          <p className="mt-1 text-[11px] leading-4 text-sidebar-foreground/55">Mock data only · No production connection</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function PageBreadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  return (
    <Breadcrumb className="hidden md:block">
      <BreadcrumbList className="text-xs">
        <BreadcrumbItem><BreadcrumbLink render={<Link href="/dashboard" />}>Workspace</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        {parts.map((part, index) => (
          <span key={`${part}-${index}`} className="contents">
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {index === parts.length - 1
                ? <BreadcrumbPage>{part === "new" ? "New order" : parts[0] === "orders" && index > 0 ? "Order details" : titleMap[part] ?? part}</BreadcrumbPage>
                : <BreadcrumbLink render={<Link href={`/${parts.slice(0, index + 1).join("/")}`} />}>{titleMap[part] ?? part}</BreadcrumbLink>}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 text-white backdrop-blur md:border-border md:bg-white/95 md:px-6 md:text-foreground">
      <SidebarTrigger className="text-white hover:bg-sidebar-accent hover:text-white md:hidden" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-base font-semibold tracking-tight text-white md:hidden"><Sparkles className="size-4 text-cyan-400" /> NexaNotion</p>
        <PageBreadcrumbs pathname={pathname} />
      </div>
      <InputGroup className="hidden h-9 max-w-[260px] bg-muted/50 lg:flex">
        <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
        <InputGroupInput placeholder="Search workspace" aria-label="Search workspace" />
        <InputGroupAddon align="inline-end" className="text-[10px]">⌘ K</InputGroupAddon>
      </InputGroup>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" className="hidden gap-2 sm:flex" />}>
          <Plus className="size-4" /> Add new <ChevronDown className="size-3.5 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Create record</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/orders/new" />}><ShoppingBag /> New order</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/products" />}><PackagePlus /> New product</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/expenses" />}><CircleDollarSign /> New expense</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" aria-label="Notifications" className="relative text-white hover:bg-sidebar-accent hover:text-white md:text-foreground md:hover:bg-muted md:hover:text-foreground">
        <Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-coral-500 bg-red-500" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-1.5" />}>
          <Avatar size="sm"><AvatarFallback className="bg-blue-100 font-semibold text-blue-700">NI</AvatarFallback></Avatar>
          <span className="hidden text-left text-xs md:block"><span className="block font-medium">NexaNotion</span><span className="text-muted-foreground">Admin</span></span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Workspace admin</DropdownMenuLabel><DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}><SlidersHorizontal /> Settings</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

const mobileNav = [primaryNav[0], primaryNav[1], { href: "/orders/new", label: "Add", icon: Plus }, primaryNav[2], { href: "/reports", label: "More", icon: SlidersHorizontal }];

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden">
      {mobileNav.map((item) => {
        const active = pathIsActive(pathname, item.href);
        return <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? "text-primary" : "text-muted-foreground"}`}>
          <span className={item.label === "Add" ? "grid size-8 place-items-center rounded-full bg-primary text-white shadow-md" : ""}><item.icon className="size-4" /></span>{item.label}
        </Link>;
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width": "14.5rem" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <TopBar />
        <main className="min-w-0 flex-1 px-4 py-5 pb-24 md:px-6 md:py-6 md:pb-8 xl:px-8">{children}</main>
      </SidebarInset>
      <MobileNav />
    </SidebarProvider>
  );
}
