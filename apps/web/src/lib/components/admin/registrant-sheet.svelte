<script lang="ts">
	import AnswerValue from '$lib/components/admin/answer-value.svelte';
	import FormAlert from '$lib/components/admin/form-alert.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Label } from '$lib/components/ui/label';
	import * as Sheet from '$lib/components/ui/sheet';
	import { formatDateTime } from '$lib/format';
	import { isAnswered, type Registrant } from '$lib/registrant';
	import { isQuestion, type FormDefinition } from '@awsug/shared';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleSlash from '@lucide/svelte/icons/circle-slash';
	import UserX from '@lucide/svelte/icons/user-x';

	interface Props {
		/** Null while the panel is opening on somebody the filter hides. */
		registrant: Registrant | null;
		open: boolean;
		form: FormDefinition;
		requiresApproval: boolean;
		/**
		 * Appended to the decision actions' URLs. `action="?/approve"` replaces
		 * the whole query string, so the filter and the open panel only survive a
		 * decision if they are written back into it by hand.
		 */
		actionQuery: string;
		/** Where "show them anyway" goes when the filter is hiding the row. */
		unfilteredHref: string;
		result: { message?: string } | null | undefined;
		onClose: () => void;
	}

	let {
		registrant,
		open,
		form,
		requiresApproval,
		actionQuery,
		unfilteredHref,
		result,
		onClose
	}: Props = $props();

	const STATUS_BADGE = {
		pending: { label: 'Pending', variant: 'outline' as const },
		approved: { label: 'Approved', variant: 'secondary' as const },
		rejected: { label: 'Rejected', variant: 'destructive' as const }
	};

	let questions = $derived(form.filter(isQuestion));

	/*
	 * Answers whose question has since been deleted from the form. The CSV
	 * export keeps them in an `other_answers` column and the insights page has a
	 * card for them, so this panel is the last place they could have quietly
	 * disappeared.
	 */
	let orphans = $derived.by(() => {
		const known = new Set(questions.map((question) => question.id));
		return Object.entries(registrant?.answers ?? {}).filter(
			([id, value]) => !known.has(id) && isAnswered(value)
		);
	});
</script>

<!--
	Controlled with a function binding rather than `bind:open`: the open state
	lives in history (see `openId` on the page), and letting the sheet keep its
	own copy would give two answers to "is it open" that drift apart the first
	time somebody presses Escape.
-->
<Sheet.Root bind:open={() => open, (next) => (next ? undefined : onClose())}>
	<Sheet.Content side="right" class="gap-0 p-0 data-[side=right]:sm:max-w-xl">
		{#if registrant}
			<Sheet.Header class="border-border gap-1 border-b p-6">
				<Sheet.Title class="pr-8 text-lg">{registrant.fullName ?? 'Registrant'}</Sheet.Title>
				<Sheet.Description class="flex flex-wrap items-center gap-2">
					<span class="font-mono text-xs">{registrant.ticketCode}</span>
					{#if requiresApproval}
						<Badge variant={STATUS_BADGE[registrant.status].variant}>
							{STATUS_BADGE[registrant.status].label}
						</Badge>
					{/if}
					{#if registrant.checkedInAt}
						<Badge variant="secondary">
							Checked in {formatDateTime(new Date(registrant.checkedInAt))}
						</Badge>
					{/if}
				</Sheet.Description>
				<p class="text-muted-foreground mt-1 text-xs">
					Registered {formatDateTime(new Date(registrant.createdAt))}
				</p>
				{#if registrant.reviewNote}
					<p class="text-muted-foreground mt-2 text-sm text-pretty">
						Reason given: {registrant.reviewNote}
					</p>
				{/if}
			</Sheet.Header>

			<div class="flex-1 overflow-y-auto p-6">
				<!--
					The form drives the order, so the panel reads the way the person
					filled it in. Content blocks — headings, images, dividers — are left
					out: they asked for nothing, so they answer nothing.
				-->
				<dl class="flex flex-col gap-4">
					{#each questions as question (question.id)}
						<div>
							<dt class="text-muted-foreground text-xs">{question.label}</dt>
							<dd class="mt-1 text-sm">
								<AnswerValue type={question.type} value={registrant.answers[question.id]} />
							</dd>
						</div>
					{/each}
				</dl>

				{#if orphans.length > 0}
					<h3 class="text-muted-foreground mt-8 text-xs font-medium">
						Answers to removed questions
					</h3>
					<dl class="mt-3 flex flex-col gap-4">
						{#each orphans as [id, value] (id)}
							<div>
								<dt class="text-muted-foreground font-mono text-xs">{id}</dt>
								<!--
									No question left to say what type it was, so the value's own
									shape decides how it reads.
								-->
								<dd class="mt-1 text-sm"><AnswerValue type="shortText" {value} /></dd>
							</div>
						{/each}
					</dl>
				{/if}
			</div>

			{#if requiresApproval}
				<Sheet.Footer class="border-border border-t p-4">
					<!--
						The same plain posts as the table rows, carrying the same repeated
						`id` field, so one decision here takes the identical server path as
						forty from the bulk bar — and still works with no JavaScript.
					-->
					<FormAlert form={result} class="mb-1" />
					{#if registrant.status !== 'rejected'}
						<form
							method="POST"
							action="?/reject{actionQuery}"
							class="flex flex-wrap items-end justify-end gap-3"
						>
							<input type="hidden" name="id" value={registrant.id} />
							<div class="min-w-48 flex-1">
								<Label for="sheet-note" class="text-muted-foreground text-xs">
									Reason (optional — included in the email)
								</Label>
								<InputGroup.Root class="mt-1">
									<InputGroup.Input
										id="sheet-note"
										name="note"
										maxlength={500}
										placeholder="We were oversubscribed this time"
									/>
								</InputGroup.Root>
							</div>
							<Button type="submit" size="sm" variant="outline">
								<CircleSlash data-icon="inline-start" />
								Reject
							</Button>
						</form>
					{/if}
					{#if registrant.status !== 'approved'}
						<form method="POST" action="?/approve{actionQuery}" class="flex justify-end">
							<input type="hidden" name="id" value={registrant.id} />
							<Button type="submit" size="sm">
								<CircleCheck data-icon="inline-start" />
								Approve
							</Button>
						</form>
					{/if}
				</Sheet.Footer>
			{/if}
		{:else}
			<!--
				A link can point at somebody the current filter hides — the pending
				queue does not contain an approved registrant. Saying so beats a panel
				that silently refuses to open.
			-->
			<Sheet.Header class="p-6">
				<Sheet.Title>Not in this list</Sheet.Title>
				<Sheet.Description>They may have been decided already.</Sheet.Description>
			</Sheet.Header>
			<div class="p-6">
				<Empty.Root>
					<Empty.Header>
						<Empty.Media variant="icon"><UserX /></Empty.Media>
						<Empty.Description>
							This registrant is filtered out of the list you are looking at.
						</Empty.Description>
					</Empty.Header>
					<Empty.Content>
						<Button href={unfilteredHref} variant="outline" size="sm">Show all registrants</Button>
					</Empty.Content>
				</Empty.Root>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
